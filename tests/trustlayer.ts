import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import type { Trustlayer } from "../target/types/trustlayer";

describe("trustlayer escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Trustlayer as Program<Trustlayer>;
  const connection = provider.connection;

  const ESCROW_SEED = Buffer.from("escrow");
  const VAULT_SEED = Buffer.from("vault");

  let mint: PublicKey;
  let seller: Keypair;
  let buyer: Keypair;
  let outsider: Keypair;
  let sellerTokenAccount: PublicKey;

  const AMOUNT = 10_000_000; // 10 tokens at 6 decimals

  async function airdrop(pubkey: PublicKey, sol = 2) {
    const sig = await connection.requestAirdrop(pubkey, sol * anchor.web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  function escrowIdFor(seed: string): BN {
    // Deterministic per-test escrow id derived from a string seed, kept
    // small enough to fit comfortably in a u64 / f64-safe range.
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return new BN(h + 1);
  }

  function derivePdas(sellerPk: PublicKey, escrowId: BN) {
    const [escrow] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, sellerPk.toBuffer(), escrowId.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, escrow.toBuffer()], program.programId);
    return { escrow, vault };
  }

  async function initEscrow(escrowId: BN, escrow: PublicKey, vault: PublicKey) {
    await program.methods
      .initializeEscrow(escrowId, new BN(AMOUNT))
      .accounts({
        seller: seller.publicKey,
        escrow,
        mint,
        vault,
      })
      .signers([seller])
      .rpc();
  }

  before(async () => {
    seller = Keypair.generate();
    buyer = Keypair.generate();
    outsider = Keypair.generate();

    await Promise.all([airdrop(seller.publicKey), airdrop(buyer.publicKey), airdrop(outsider.publicKey)]);

    mint = await createMint(connection, seller, seller.publicKey, null, 6);

    const buyerAta = await getOrCreateAssociatedTokenAccount(connection, buyer, mint, buyer.publicKey);
    await mintTo(connection, seller, mint, buyerAta.address, seller, 1_000_000_000);

    const sellerAta = await getOrCreateAssociatedTokenAccount(connection, seller, mint, seller.publicKey);
    sellerTokenAccount = sellerAta.address;
  });

  it("initializes an escrow in Created status", async () => {
    const escrowId = escrowIdFor("init-happy-path");
    const { escrow, vault } = derivePdas(seller.publicKey, escrowId);

    await initEscrow(escrowId, escrow, vault);

    const account = await program.account.escrow.fetch(escrow);
    assert.equal(account.seller.toBase58(), seller.publicKey.toBase58());
    assert.equal(account.buyer, null);
    assert.equal(account.amount.toNumber(), AMOUNT);
    assert.deepEqual(account.status, { created: {} });
  });

  it("moves funds into the vault on deposit and marks the escrow Funded", async () => {
    const escrowId = escrowIdFor("deposit-happy-path");
    const { escrow, vault } = derivePdas(seller.publicKey, escrowId);

    await initEscrow(escrowId, escrow, vault);

    const buyerAta = await getOrCreateAssociatedTokenAccount(connection, buyer, mint, buyer.publicKey);

    await program.methods
      .deposit()
      .accounts({
        buyer: buyer.publicKey,
        escrow,
        mint,
        buyerTokenAccount: buyerAta.address,
        vault,
      })
      .signers([buyer])
      .rpc();

    const vaultAccount = await getAccount(connection, vault);
    assert.equal(Number(vaultAccount.amount), AMOUNT);

    const account = await program.account.escrow.fetch(escrow);
    assert.deepEqual(account.status, { funded: {} });
    assert.equal(account.buyer?.toBase58(), buyer.publicKey.toBase58());
  });

  it("pays the seller and marks Released when the buyer releases", async () => {
    const escrowId = escrowIdFor("release-happy-path");
    const { escrow, vault } = derivePdas(seller.publicKey, escrowId);

    await initEscrow(escrowId, escrow, vault);

    const buyerAta = await getOrCreateAssociatedTokenAccount(connection, buyer, mint, buyer.publicKey);

    await program.methods
      .deposit()
      .accounts({
        buyer: buyer.publicKey,
        escrow,
        mint,
        buyerTokenAccount: buyerAta.address,
        vault,
      })
      .signers([buyer])
      .rpc();

    const sellerBalanceBefore = (await getAccount(connection, sellerTokenAccount)).amount;

    await program.methods
      .release()
      .accounts({
        buyer: buyer.publicKey,
        escrow,
        mint,
        vault,
        seller: seller.publicKey,
        sellerTokenAccount,
      })
      .signers([buyer])
      .rpc();

    const sellerBalanceAfter = (await getAccount(connection, sellerTokenAccount)).amount;
    assert.equal(Number(sellerBalanceAfter - sellerBalanceBefore), AMOUNT);

    const account = await program.account.escrow.fetch(escrow);
    assert.deepEqual(account.status, { released: {} });
  });

  it("rejects release from someone other than the buyer", async () => {
    const escrowId = escrowIdFor("unauthorized-release");
    const { escrow, vault } = derivePdas(seller.publicKey, escrowId);

    await initEscrow(escrowId, escrow, vault);

    const buyerAta = await getOrCreateAssociatedTokenAccount(connection, buyer, mint, buyer.publicKey);
    await program.methods
      .deposit()
      .accounts({
        buyer: buyer.publicKey,
        escrow,
        mint,
        buyerTokenAccount: buyerAta.address,
        vault,
      })
      .signers([buyer])
      .rpc();

    let threw = false;
    try {
      await program.methods
        .release()
        .accounts({
          buyer: outsider.publicKey,
          escrow,
          mint,
          vault,
          seller: seller.publicKey,
          sellerTokenAccount,
        })
        .signers([outsider])
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "UnauthorizedBuyer");
    }
    assert.isTrue(threw, "expected release from a non-buyer to fail");
  });

  it("rejects a deposit that uses a token account from the wrong mint", async () => {
    const escrowId = escrowIdFor("wrong-mint");
    const { escrow, vault } = derivePdas(seller.publicKey, escrowId);

    await initEscrow(escrowId, escrow, vault);

    const wrongMint = await createMint(connection, outsider, outsider.publicKey, null, 6);
    const wrongAta = await getOrCreateAssociatedTokenAccount(connection, outsider, wrongMint, buyer.publicKey);
    await mintTo(connection, outsider, wrongMint, wrongAta.address, outsider, AMOUNT * 2);

    let threw = false;
    try {
      await program.methods
        .deposit()
        .accounts({
          buyer: buyer.publicKey,
          escrow,
          mint,
          buyerTokenAccount: wrongAta.address,
          vault,
        })
        .signers([buyer])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "expected deposit with mismatched mint token account to fail");
  });
});
