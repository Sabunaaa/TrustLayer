"use client";

import type { RiskResult } from "@/lib/types";

const DECISION_STYLES: Record<RiskResult["decision"], { label: string; ring: string; bar: string; text: string }> = {
  low: {
    label: "Low risk signal",
    ring: "border-emerald-400/40 bg-emerald-400/10",
    bar: "bg-emerald-400",
    text: "text-emerald-300",
  },
  medium: {
    label: "Medium risk signal",
    ring: "border-amber-400/40 bg-amber-400/10",
    bar: "bg-amber-400",
    text: "text-amber-300",
  },
  high: {
    label: "High risk signal",
    ring: "border-rose-400/40 bg-rose-400/10",
    bar: "bg-rose-400",
    text: "text-rose-300",
  },
};

export default function TrustScoreCard({ result, title }: { result: RiskResult; title: string }) {
  const style = DECISION_STYLES[result.decision];

  return (
    <div className={`rounded-xl border p-4 ${style.ring}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-neutral-300">{title}</h3>
        {result.mocked && (
          <span className="text-[10px] rounded-full border border-neutral-500/40 px-2 py-0.5 text-neutral-400">
            demo mock
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-neutral-700/60 overflow-hidden">
          <div className={`h-full ${style.bar}`} style={{ width: `${result.riskScore}%` }} />
        </div>
        <span className={`text-sm font-semibold ${style.text}`}>{result.riskScore}/100</span>
      </div>
      <p className={`mt-1 text-xs font-medium ${style.text}`}>{style.label}</p>

      {typeof result.imageMatch === "boolean" && (
        <p className="mt-2 text-xs">
          Image match:{" "}
          <span className={result.imageMatch ? "text-emerald-300" : "text-rose-300"}>
            {result.imageMatch ? "Consistent with listing photos" : "Possible mismatch"}
          </span>
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {result.reasons.map((reason, i) => (
          <li key={i} className="text-sm text-neutral-300 flex gap-2">
            <span className="text-neutral-500">•</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-neutral-500">
        Advisory signal only — TrustLayer&apos;s AI helps flag risk, it does not verify authenticity, ownership, or
        delivery. The buyer and seller always make the final call.
      </p>
    </div>
  );
}
