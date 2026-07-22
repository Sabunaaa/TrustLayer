import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr/LockKey";
import { CoinsIcon } from "@phosphor-icons/react/dist/ssr/Coins";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { HandshakeIcon } from "@phosphor-icons/react/dist/ssr/Handshake";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/ssr/ChatCircle";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import Logo from "@/components/Logo";
import TrustScoreCard from "@/components/TrustScoreCard";
import type { RiskResult } from "@/lib/types";

const PREVIEW_RISK: RiskResult = {
  riskScore: 18,
  decision: "low",
  summary:
    "Listing photos match the description and the price sits close to comparable sales for this model and condition.",
  reasons: ["Photos show real wear consistent with the description", "Price is within range for this condition"],
  observations: ["Serial number visible in one photo", "Original box included"],
  concerns: ["No return policy mentioned"],
  buyerAdvice: "Ask the seller to confirm the serial number matches before funding the escrow.",
  mocked: true,
};

const TRUST_FACTS = [
  { icon: LockKeyIcon, label: "Non-custodial", detail: "TrustLayer never holds the funds." },
  { icon: CoinsIcon, label: "On-chain settlement", detail: "Escrow runs on Solana, not a database." },
  { icon: SparkleIcon, label: "AI-assisted, not automatic", detail: "Flags risk. Buyer and seller decide." },
];

const STEPS = [
  {
    title: "List it, get a risk read",
    body: "Add photos, a description, and a price. Gemini scores the listing and flags anything that looks off before you share the link.",
  },
  {
    title: "Buyer funds the escrow",
    body: "The buyer connects a wallet and deposits USDC into a Solana program. Funds sit in the vault, not in TrustLayer's hands.",
  },
  {
    title: "Confirm delivery, release funds",
    body: "The seller uploads proof of delivery, the AI compares it to the listing photos, and the buyer releases payment on-chain.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex-1">
      <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Logo />
        <Link
          href="/create"
          className="rounded-full bg-white text-black text-sm font-medium px-4 py-2 hover:bg-neutral-200 transition-colors"
        >
          Create a listing
        </Link>
      </nav>

      <section className="mx-auto max-w-6xl px-6 pt-10 md:pt-16 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div className="animate-fade-up">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            Sell on Marketplace and Discord without the trust fall.
          </h1>
          <p className="mt-5 text-neutral-400 text-base leading-relaxed max-w-[46ch]">
            Funds lock in a non-custodial Solana escrow until delivery is confirmed. AI flags risky listings
            before anyone pays.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black text-sm font-medium px-5 py-3 hover:bg-neutral-200 transition-colors"
            >
              Create a listing
              <ArrowRightIcon size={16} weight="bold" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-700 text-sm font-medium px-5 py-3 text-neutral-300 hover:border-neutral-500 hover:text-white transition-colors"
            >
              See how it works
            </a>
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <p className="text-xs font-medium text-neutral-500 mb-2">Live risk read, from a real listing</p>
          <TrustScoreCard result={PREVIEW_RISK} title="AI listing review" />
        </div>
      </section>

      <section className="border-y border-neutral-800/80">
        <div className="mx-auto max-w-6xl px-6 py-10 grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800/80">
          {TRUST_FACTS.map(({ icon: Icon, label, detail }) => (
            <div key={label} className="flex items-start gap-3 py-4 sm:py-0 sm:px-6 first:sm:pl-0">
              <Icon size={20} weight="regular" className="text-sky-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-neutral-200">{label}</p>
                <p className="text-sm text-neutral-500 mt-0.5">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight max-w-[24ch]">
          Three steps, funds never touch TrustLayer.
        </h2>
        <div className="mt-12 relative">
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-neutral-800 hidden sm:block" aria-hidden />
          <ol className="space-y-10">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative sm:pl-12">
                <span className="hidden sm:flex absolute left-0 top-0 h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 font-mono text-xs text-neutral-400">
                  {i + 1}
                </span>
                <h3 className="text-lg font-medium text-neutral-100">{step.title}</h3>
                <p className="mt-1.5 text-neutral-400 text-sm leading-relaxed max-w-[60ch]">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 to-transparent p-8">
            <SparkleIcon size={22} className="text-sky-400" weight="regular" />
            <h3 className="mt-4 text-xl font-medium text-neutral-100">AI reads the listing, not the outcome</h3>
            <p className="mt-2 text-neutral-400 text-sm leading-relaxed max-w-[52ch]">
              Gemini checks the description against the photos at listing time, and again at delivery time,
              comparing the proof-of-delivery photo to what was promised. It surfaces concerns; it never
              blocks a transaction on its own.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 p-8 flex flex-col justify-between">
            <HandshakeIcon size={22} className="text-neutral-400" weight="regular" />
            <div>
              <h3 className="mt-4 text-lg font-medium text-neutral-100">Built for the DMs</h3>
              <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
                Share one link over Telegram, Discord, or Marketplace chat. No app to install.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 p-8">
            <ChatCircleIcon size={22} className="text-neutral-400" weight="regular" />
            <h3 className="mt-4 text-lg font-medium text-neutral-100">One link does it all</h3>
            <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
              The same page adapts for the seller and the buyer, based on which wallet connects.
            </p>
          </div>
          <div className="md:col-span-2 rounded-2xl border border-neutral-800 p-8 flex items-center gap-4">
            <CheckCircleIcon size={22} className="text-emerald-400 shrink-0" weight="regular" />
            <p className="text-neutral-300 text-sm leading-relaxed">
              Delivery confirmed by the buyer releases the escrow instantly on Solana. No chargebacks, no
              waiting on a payment processor.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-800/80">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Ready to list something safely?</h2>
          <p className="mt-3 text-neutral-400 text-sm">Takes about a minute. No signup, just a wallet.</p>
          <Link
            href="/create"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-white text-black text-sm font-medium px-6 py-3 hover:bg-neutral-200 transition-colors"
          >
            Create a listing
            <ArrowRightIcon size={16} weight="bold" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-neutral-800/80">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-neutral-500">Running on Solana devnet. Escrow is non-custodial.</p>
        </div>
      </footer>
    </main>
  );
}
