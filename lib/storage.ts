"use client";

import { getSupabase } from "@/lib/supabase";
import type { Listing } from "@/lib/types";

export async function saveListing(listing: Listing): Promise<void> {
  const { error } = await getSupabase().from("listings").upsert({
    id: listing.id,
    data: listing,
    created_at: new Date(listing.createdAt).toISOString(),
  });
  if (error) {
    console.error("Failed to save listing:", error);
    throw new Error(error.message);
  }
}

export async function getListing(id: string): Promise<Listing | undefined> {
  const { data, error } = await getSupabase()
    .from("listings")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Failed to load listing:", error);
    return undefined;
  }
  return (data?.data as Listing | undefined) ?? undefined;
}

export async function updateListing(id: string, patch: Partial<Listing>): Promise<Listing | undefined> {
  const existing = await getListing(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  await saveListing(updated);
  return updated;
}

export async function listListings(): Promise<Listing[]> {
  const { data, error } = await getSupabase()
    .from("listings")
    .select("data")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to list listings:", error);
    return [];
  }
  return (data ?? []).map((row) => row.data as Listing);
}

/** Wipes all demo listings. Used by the "reset demo" control. */
export async function clearAllListings(): Promise<void> {
  const { error } = await getSupabase().from("listings").delete().neq("id", "");
  if (error) {
    console.error("Failed to clear listings:", error);
    throw new Error(error.message);
  }
}

export function generateListingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `listing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Fits comfortably in a JS-safe integer and in Anchor's u64, used as the on-chain escrow seed. */
export function generateEscrowId(): number {
  return Math.floor(Date.now() % 1_000_000_000) * 1000 + Math.floor(Math.random() * 1000);
}
