/**
 * One-off devnet setup script for the hackathon demo fallback token.
 *
 * Creates a six-decimal "Demo USDC" SPL mint (mint authority = the deployer
 * keypair) and mints a starting balance to any wallet addresses passed on
 * the command line, so both the seller and buyer browser wallets have
 * something to trade with when the real devnet USDC faucet isn't available.
 *
 * Usage:
 *   npx ts-node scripts/create-demo-mint.ts <buyerPubkey> [sellerPubkey...]
 *
 * Requires `keys/deployer.json` to hold enough devnet SOL to pay for the
 * mint account, each recipient's associated token account, and tx fees
 * (well under 0.1 SOL total).
 */
import { readFileSync } from "fs";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DECIMALS = 6;
const STARTING_BALANCE = 1_000; // 1,000 Demo USDC per recipient

async function main() {
  const recipients = process.argv.slice(2).map((s) => new PublicKey(s));
  if (recipients.length === 0) {
    console.error("Pass at least one recipient pubkey (the buyer wallet) as an argument.");
    process.exit(1);
  }

  const secret = JSON.parse(readFileSync("keys/deployer.json", "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(RPC_URL, "confirmed");

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Deployer ${payer.publicKey.toBase58()} balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.warn("Warning: deployer balance is low, this may fail partway through.");
  }

  console.log("Creating Demo USDC mint...");
  const mint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
  console.log(`Mint created: ${mint.toBase58()}`);

  for (const recipient of recipients) {
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient);
    await mintTo(
      connection,
      payer,
      mint,
      ata.address,
      payer,
      STARTING_BALANCE * 10 ** DECIMALS,
    );
    console.log(`Minted ${STARTING_BALANCE} Demo USDC to ${recipient.toBase58()} (${ata.address.toBase58()})`);
  }

  console.log("\nAdd this to .env.local:");
  console.log(`NEXT_PUBLIC_DEMO_MINT=${mint.toBase58()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
