"use client";

import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import idl from "@/lib/solana/idl.json";
import type { Trustlayer } from "@/lib/solana/trustlayer";
import { ESCROW_SEED, PROGRAM_ID, SOLANA_RPC_URL, TOKEN_DECIMALS, VAULT_SEED } from "./constants";
import type { EscrowStatus } from "@/lib/types";

export interface EscrowChainState {
  address: string;
  vault: string;
  seller: string;
  buyer: string | null;
  mint: string;
  amount: number;
  status: EscrowStatus;
}

const READONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("Read-only connection cannot sign transactions.");
  },
  signAllTransactions: async () => {
    throw new Error("Read-only connection cannot sign transactions.");
  },
};

function toProgram(wallet: AnchorProvider["wallet"]): Program<Trustlayer> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as Idl, provider) as unknown as Program<Trustlayer>;
}

function getProgram(wallet: WalletContextState): Program<Trustlayer> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }
  return toProgram({
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction.bind(wallet),
    signAllTransactions: wallet.signAllTransactions?.bind(wallet) ?? (async (txs) => txs),
  } as AnchorProvider["wallet"]);
}

function getReadonlyProgram(): Program<Trustlayer> {
  return toProgram(READONLY_WALLET as unknown as AnchorProvider["wallet"]);
}

export function deriveEscrowPdas(seller: PublicKey, escrowId: number) {
  const idBuf = new BN(escrowId).toArrayLike(Buffer, "le", 8);
  const [escrow] = PublicKey.findProgramAddressSync([ESCROW_SEED, seller.toBuffer(), idBuf], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, escrow.toBuffer()], PROGRAM_ID);
  return { escrow, vault };
}

export function amountToBaseUnits(amountUi: number): BN {
  return new BN(Math.round(amountUi * 10 ** TOKEN_DECIMALS));
}

export async function createEscrow(
  wallet: WalletContextState,
  params: { escrowId: number; amountUi: number; mint: PublicKey },
): Promise<{ signature: string; escrow: PublicKey; vault: PublicKey }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const program = getProgram(wallet);
  const { escrow, vault } = deriveEscrowPdas(wallet.publicKey, params.escrowId);

  const signature = await program.methods
    .initializeEscrow(new BN(params.escrowId), amountToBaseUnits(params.amountUi))
    .accounts({
      seller: wallet.publicKey,
      escrow,
      mint: params.mint,
      vault,
    })
    .rpc();

  return { signature, escrow, vault };
}

export async function depositEscrow(
  wallet: WalletContextState,
  params: { seller: PublicKey; escrowId: number; mint: PublicKey },
): Promise<{ signature: string; escrow: PublicKey; vault: PublicKey }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const program = getProgram(wallet);
  const { escrow, vault } = deriveEscrowPdas(params.seller, params.escrowId);
  const buyerTokenAccount = getAssociatedTokenAddressSync(params.mint, wallet.publicKey);

  const signature = await program.methods
    .deposit()
    .accounts({
      buyer: wallet.publicKey,
      escrow,
      mint: params.mint,
      buyerTokenAccount,
      vault,
    })
    .rpc();

  return { signature, escrow, vault };
}

export async function releaseEscrow(
  wallet: WalletContextState,
  params: { seller: PublicKey; escrowId: number; mint: PublicKey },
): Promise<{ signature: string }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const program = getProgram(wallet);
  const { escrow, vault } = deriveEscrowPdas(params.seller, params.escrowId);
  const sellerTokenAccount = getAssociatedTokenAddressSync(params.mint, params.seller);

  const signature = await program.methods
    .release()
    .accounts({
      buyer: wallet.publicKey,
      escrow,
      mint: params.mint,
      vault,
      seller: params.seller,
      sellerTokenAccount,
    })
    .rpc();

  return { signature };
}

export async function fetchEscrow(seller: PublicKey, escrowId: number): Promise<EscrowChainState | null> {
  const program = getReadonlyProgram();
  const { escrow, vault } = deriveEscrowPdas(seller, escrowId);
  try {
    const account = await program.account.escrow.fetch(escrow);
    const statusKey = Object.keys(account.status as object)[0] as EscrowStatus;
    return {
      address: escrow.toBase58(),
      vault: vault.toBase58(),
      seller: (account.seller as PublicKey).toBase58(),
      buyer: account.buyer ? (account.buyer as PublicKey).toBase58() : null,
      mint: (account.mint as PublicKey).toBase58(),
      amount: (account.amount as BN).toNumber(),
      status: statusKey,
    };
  } catch {
    return null;
  }
}
