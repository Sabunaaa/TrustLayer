import { PublicKey } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "3RboLzPe7dQf6S8YdC9ecmhDT2KdyU4MuS2ybwyaHMan",
);

export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || 6);

export const TOKEN_LABEL = process.env.NEXT_PUBLIC_TOKEN_LABEL || "Demo USDC";

/**
 * Devnet USDC if you managed to get some from a faucet, otherwise the
 * team's own six-decimal "Demo USDC" mint. Must be set before the deposit
 * flow will work - see README "Token setup" for the mint-creation command.
 */
export function getDemoMint(): PublicKey | null {
  const raw = process.env.NEXT_PUBLIC_DEMO_MINT;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export const ESCROW_SEED = Buffer.from("escrow");
export const VAULT_SEED = Buffer.from("vault");

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
