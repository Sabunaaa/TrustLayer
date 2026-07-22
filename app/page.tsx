"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ImageDropzone from "@/components/ImageDropzone";
import TrustScoreCard from "@/components/TrustScoreCard";
import { clearAllListings, generateListingId, listListings, saveListing } from "@/lib/storage";
import type { Listing, RiskResult } from "@/lib/types";

export default function CreateListingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const [priorListings, setPriorListings] = useState<Listing[]>([]);

  useEffect(() => {
    let cancelled = false;
    listListings().then((rows) => {
      if (!cancelled) setPriorListings(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function handleReset() {
    if (!window.confirm("Clear all TrustLayer demo listings?")) return;
    await clearAllListings();
    setPriorListings([]);
  }

  const canSubmit = title.trim().length > 0 && images.length > 0 && Number(price) > 0 && !analyzing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setAnalyzing(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "initial",
          title,
          description,
          price: Number(price),
          images,
        }),
      });

      const payload = (await res.json()) as RiskResult & { error?: string };
      if (!res.ok) throw new Error(payload.error || "Analysis request failed");
      setRisk(payload);

      const id = generateListingId();
      await saveListing({
        id,
        title,
        description,
        price: Number(price),
        images,
        sellerPubkey: "",
        createdAt: Date.now(),
        initialRisk: payload,
        escrowStatus: "created",
      });
      setListingId(id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not analyze this listing. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function goToListing() {
    if (listingId) router.push(`/listing/${listingId}`);
  }

  return (
    <main className="mx-auto max-w-2xl w-full px-6 py-12 flex-1">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">TrustLayer</h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Sell safely on Facebook Marketplace, Telegram, or Discord. Funds sit in a Solana escrow until the
            buyer confirms delivery — TrustLayer&apos;s AI just helps flag risk along the way.
          </p>
        </div>
        {priorListings.length > 0 && (
          <button
            onClick={handleReset}
            className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
          >
            Reset demo
          </button>
        )}
      </header>

      {!listingId ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. iPhone 14 Pro, 256GB, unlocked"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Condition, accessories included, why you're selling..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Price (USDC)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="150"
              className="w-40 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Photos (1-3)</label>
            <ImageDropzone images={images} onChange={setImages} />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-white text-black font-medium py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-200 transition"
          >
            {analyzing ? "Analyzing listing…" : "Create secure listing"}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          {risk && <TrustScoreCard result={risk} title="AI listing review" />}
          <button
            onClick={goToListing}
            className="w-full rounded-lg bg-white text-black font-medium py-2.5 text-sm hover:bg-neutral-200 transition"
          >
            Continue to transaction page →
          </button>
        </div>
      )}

      {!listingId && priorListings.length > 0 && (
        <div className="mt-10 border-t border-neutral-800 pt-6">
          <h2 className="text-sm font-semibold text-neutral-300 mb-3">Recent listings</h2>
          <ul className="space-y-2">
            {priorListings.slice(0, 5).map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => router.push(`/listing/${l.id}`)}
                  className="w-full flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2 text-sm text-left hover:border-neutral-600 transition"
                >
                  <span className="truncate">{l.title}</span>
                  <span className="text-neutral-500 text-xs shrink-0 ml-3 capitalize">{l.escrowStatus}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
