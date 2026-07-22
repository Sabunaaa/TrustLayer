"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import WalletButton from "@/components/WalletButton";
import ImageDropzone from "@/components/ImageDropzone";
import TrustScoreCard from "@/components/TrustScoreCard";
import EscrowTimeline from "@/components/EscrowTimeline";
import ExplorerLink from "@/components/ExplorerLink";
import { generateEscrowId, getListing, updateListing } from "@/lib/storage";
import { createEscrow, depositEscrow, fetchEscrow, releaseEscrow } from "@/lib/solana/client";
import { explorerAddressUrl, explorerTxUrl, getDemoMint, TOKEN_LABEL } from "@/lib/solana/constants";
import type { Listing, RiskResult } from "@/lib/types";

type BusyAction = "activate" | "deposit" | "release" | "compare" | null;

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const wallet = useWallet();

  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [finalImages, setFinalImages] = useState<string[]>([]);
  const [copyLabel, setCopyLabel] = useState("Copy buyer link");

  const refresh = useCallback(async () => {
    const stored = getListing(id);
    if (!stored) {
      setListing(null);
      return;
    }
    if (stored.escrowStatus !== "created" || stored.escrowAddress) {
      try {
        const seller = new PublicKey(stored.sellerPubkey);
        const escrowId = stored.escrowId;
        if (escrowId) {
          const chain = await fetchEscrow(seller, escrowId);
          if (chain) {
            const merged = updateListing(id, {
              escrowStatus: chain.status,
              buyerPubkey: chain.buyer ?? stored.buyerPubkey,
            });
            setListing(merged ?? stored);
            return;
          }
        }
      } catch {
        // fall through to whatever is cached locally
      }
    }
    setListing(stored);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/id-change
    refresh();
  }, [refresh]);

  if (listing === undefined) {
    return <main className="mx-auto max-w-2xl w-full px-6 py-12 flex-1 text-neutral-400">Loading…</main>;
  }

  if (listing === null) {
    return (
      <main className="mx-auto max-w-2xl w-full px-6 py-12 flex-1">
        <p className="text-neutral-300">
          Couldn&apos;t find this listing on this device/browser. TrustLayer&apos;s hackathon demo stores listing
          details in the browser that created it — open the buyer link in the same browser profile (a new
          tab is fine).
        </p>
      </main>
    );
  }

  const escrowId = listing.escrowId;
  const isSeller = Boolean(wallet.publicKey && listing.sellerPubkey === wallet.publicKey.toBase58());
  const isBuyer = Boolean(wallet.publicKey && listing.buyerPubkey === wallet.publicKey.toBase58());
  const isUnclaimedSeller = listing.sellerPubkey === "";
  const canBecomeBuyer = Boolean(
    wallet.publicKey && !isSeller && listing.escrowStatus === "created" && listing.escrowAddress,
  );
  const mint = getDemoMint();

  let roleLabel: string;
  if (!wallet.publicKey) {
    roleLabel = "No wallet connected";
  } else if (isSeller) {
    roleLabel = "Connected as the seller";
  } else if (isBuyer) {
    roleLabel = "Connected as the buyer";
  } else if (listing.escrowAddress && listing.buyerPubkey) {
    roleLabel = "This wallet isn't the seller or buyer on this listing";
  } else {
    roleLabel = "Connected — not yet assigned a role on this listing";
  }

  async function handleActivate() {
    if (!listing || !wallet.publicKey) return;
    if (!mint) {
      setError("Set NEXT_PUBLIC_DEMO_MINT in .env.local before activating an escrow.");
      return;
    }
    setError(null);
    setBusy("activate");
    try {
      const newEscrowId = generateEscrowId();
      const { signature, escrow, vault } = await createEscrow(wallet, {
        escrowId: newEscrowId,
        amountUi: listing.price,
        mint,
      });
      const updated = updateListing(id, {
        sellerPubkey: wallet.publicKey.toBase58(),
        escrowId: newEscrowId,
        escrowAddress: escrow.toBase58(),
        vaultAddress: vault.toBase58(),
        initSignature: signature,
      });
      setListing(updated ?? listing);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to activate escrow.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeposit() {
    if (!listing || !wallet.publicKey || !mint || !escrowId) return;
    setError(null);
    setBusy("deposit");
    try {
      const { signature } = await depositEscrow(wallet, {
        seller: new PublicKey(listing.sellerPubkey),
        escrowId,
        mint,
      });
      const updated = updateListing(id, {
        escrowStatus: "funded",
        buyerPubkey: wallet.publicKey.toBase58(),
        depositSignature: signature,
      });
      setListing(updated ?? listing);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCompare() {
    if (!listing || finalImages.length === 0) return;
    setError(null);
    setBusy("compare");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "compare",
          title: listing.title,
          description: listing.description,
          originalImages: listing.images,
          finalImage: finalImages[0],
        }),
      });
      if (!res.ok) throw new Error("Comparison failed");
      const result: RiskResult = await res.json();
      const updated = updateListing(id, { finalImage: finalImages[0], compareRisk: result });
      setListing(updated ?? listing);
      setDelivered(true);
    } catch (err) {
      console.error(err);
      setError("Could not analyze the delivery photo.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRelease() {
    if (!listing || !wallet.publicKey || !mint || !escrowId) return;
    setError(null);
    setBusy("release");
    try {
      const { signature } = await releaseEscrow(wallet, {
        seller: new PublicKey(listing.sellerPubkey),
        escrowId,
        mint,
      });
      const updated = updateListing(id, { escrowStatus: "released", releaseSignature: signature });
      setListing(updated ?? listing);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusy(null);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/listing/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy buyer link"), 1500);
    });
  }

  return (
    <main className="mx-auto max-w-2xl w-full px-6 py-10 flex-1 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{listing.title}</h1>
        <WalletButton />
      </div>

      <p className="text-xs text-neutral-500 -mt-4">{roleLabel}</p>

      <div className="flex gap-3 overflow-x-auto">
        {listing.images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt={listing.title} className="h-40 w-40 object-cover rounded-lg border border-neutral-800" />
        ))}
      </div>

      <p className="text-neutral-300 text-sm">{listing.description}</p>
      <p className="text-lg font-semibold">
        {listing.price.toFixed(2)} <span className="text-neutral-400 text-sm">{TOKEN_LABEL}</span>
      </p>

      {listing.initialRisk && <TrustScoreCard result={listing.initialRisk} title="AI listing review" />}

      <div className="rounded-xl border border-neutral-800 p-4">
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Escrow status</h2>
        <EscrowTimeline status={listing.escrowStatus} delivered={delivered || Boolean(listing.finalImage)} />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!listing.escrowAddress && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-4 space-y-3">
          <p className="text-sm text-neutral-300">
            Connect the seller&apos;s wallet to lock this listing into a Solana escrow before sharing the buyer
            link.
            {isUnclaimedSeller && wallet.publicKey && (
              <span className="block mt-1 text-amber-400/90">
                Whichever wallet clicks the button below becomes the recorded seller — make sure it&apos;s
                the seller&apos;s wallet, not the buyer&apos;s.
              </span>
            )}
          </p>
          <WalletButton />
          <button
            onClick={handleActivate}
            disabled={!wallet.publicKey || busy === "activate"}
            className="w-full rounded-lg bg-white text-black font-medium py-2.5 text-sm disabled:opacity-40"
          >
            {busy === "activate" ? "Activating…" : "Lock listing on Solana devnet"}
          </button>
        </div>
      )}

      {listing.escrowAddress && (
        <div className="rounded-xl border border-neutral-800 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">Escrow account</span>
            <ExplorerLink href={explorerAddressUrl(listing.escrowAddress)}>
              {listing.escrowAddress.slice(0, 4)}…{listing.escrowAddress.slice(-4)}
            </ExplorerLink>
          </div>
          {listing.initSignature && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Init tx</span>
              <ExplorerLink href={explorerTxUrl(listing.initSignature)}>view</ExplorerLink>
            </div>
          )}
          {listing.depositSignature && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Deposit tx</span>
              <ExplorerLink href={explorerTxUrl(listing.depositSignature)}>view</ExplorerLink>
            </div>
          )}
          {listing.releaseSignature && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Release tx</span>
              <ExplorerLink href={explorerTxUrl(listing.releaseSignature)}>view</ExplorerLink>
            </div>
          )}
        </div>
      )}

      {listing.escrowAddress && listing.escrowStatus === "created" && (
        <div className="rounded-xl border-2 border-sky-500 bg-sky-500/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-sky-200">
            {isSeller ? "Send this link to the buyer" : "Buyer link for this listing"}
          </p>
          <p className="text-xs text-sky-200/70 break-all">{`${typeof window !== "undefined" ? window.location.origin : ""}/listing/${id}`}</p>
          <button
            onClick={copyLink}
            className="w-full rounded-lg bg-sky-400 hover:bg-sky-300 text-black font-semibold py-3 text-sm transition-colors"
          >
            {copyLabel}
          </button>
        </div>
      )}

      {listing.escrowAddress && listing.escrowStatus === "created" && isSeller && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          Waiting for the buyer to connect their wallet and deposit {listing.price.toFixed(2)} {TOKEN_LABEL}.
          Share the link above with them if you haven&apos;t already.
        </div>
      )}

      {listing.escrowAddress && listing.escrowStatus === "created" && !isSeller && (
        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
          <p className="text-sm text-neutral-300">
            Buyer: deposit {listing.price.toFixed(2)} {TOKEN_LABEL} into the escrow. Funds are locked in the
            program&apos;s vault, not held by TrustLayer.
          </p>
          <WalletButton />
          <button
            onClick={handleDeposit}
            disabled={!canBecomeBuyer || busy === "deposit"}
            className="w-full rounded-lg bg-white text-black font-medium py-2.5 text-sm disabled:opacity-40"
          >
            {busy === "deposit" ? "Depositing…" : `Deposit ${listing.price.toFixed(2)} ${TOKEN_LABEL}`}
          </button>
          {!canBecomeBuyer && (
            <p className="text-xs text-neutral-500">
              {wallet.publicKey
                ? "This wallet is the seller's, or already committed as buyer elsewhere — switch to the buyer's wallet."
                : "Connect the buyer's wallet above to enable this button."}
            </p>
          )}
        </div>
      )}

      {listing.escrowStatus === "funded" && !listing.finalImage && isSeller && (
        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
          <p className="text-sm text-neutral-300">
            Seller: the buyer has deposited funds. Simulate delivery by uploading a proof-of-delivery
            photo (any photo works for this demo) — AI checks it against the original listing photos.
          </p>
          <ImageDropzone images={finalImages} onChange={setFinalImages} max={1} label="Delivery photo" />
          <button
            onClick={handleCompare}
            disabled={finalImages.length === 0 || busy === "compare"}
            className="w-full rounded-lg bg-white text-black font-medium py-2.5 text-sm disabled:opacity-40"
          >
            {busy === "compare" ? "Comparing…" : "Simulate delivery & compare photo"}
          </button>
        </div>
      )}

      {listing.escrowStatus === "funded" && !listing.finalImage && !isSeller && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          Funds are deposited. Waiting for the seller to upload a delivery photo — switch to the
          seller&apos;s wallet on this device to continue that step.
        </div>
      )}

      {listing.compareRisk && <TrustScoreCard result={listing.compareRisk} title="AI delivery comparison" />}

      {listing.escrowStatus === "funded" && listing.finalImage && isSeller && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          Delivery photo submitted. Waiting for the buyer to review it and release the funds.
        </div>
      )}

      {listing.escrowStatus === "funded" && listing.finalImage && !isSeller && (
        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
          <p className="text-sm text-neutral-300">
            Buyer: delivery has been simulated. If you&apos;re satisfied, release the funds to the seller.
          </p>
          <WalletButton />
          <button
            onClick={handleRelease}
            disabled={!isBuyer || busy === "release"}
            className="w-full rounded-lg bg-white text-black font-medium py-2.5 text-sm disabled:opacity-40"
          >
            {busy === "release" ? "Releasing…" : "Release funds to seller"}
          </button>
          {!isBuyer && (
            <p className="text-xs text-neutral-500">
              {wallet.publicKey
                ? "This isn't the buyer's wallet — switch to the wallet that made the deposit."
                : "Connect the buyer's wallet above to enable this button."}
            </p>
          )}
        </div>
      )}

      {listing.escrowStatus === "released" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Funds released. This transaction is complete.
        </div>
      )}
    </main>
  );
}
