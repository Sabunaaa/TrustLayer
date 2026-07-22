"use client";

import type { Listing } from "@/lib/types";

const STORAGE_KEY = "trustlayer:listings";

function readAll(): Record<string, Listing> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Listing>) : {};
  } catch (err) {
    console.error("Failed to read TrustLayer listings from localStorage:", err);
    return {};
  }
}

function writeAll(listings: Record<string, Listing>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
}

export function saveListing(listing: Listing) {
  const all = readAll();
  all[listing.id] = listing;
  writeAll(all);
}

export function getListing(id: string): Listing | undefined {
  return readAll()[id];
}

export function updateListing(id: string, patch: Partial<Listing>): Listing | undefined {
  const all = readAll();
  const existing = all[id];
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  all[id] = updated;
  writeAll(all);
  return updated;
}

export function listListings(): Listing[] {
  return Object.values(readAll()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Wipes all demo listings from this browser. Used by the "reset demo" control. */
export function clearAllListings() {
  writeAll({});
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
