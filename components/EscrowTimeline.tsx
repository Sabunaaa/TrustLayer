"use client";

import type { EscrowStatus } from "@/lib/types";

const STEPS: { key: EscrowStatus | "delivered"; label: string }[] = [
  { key: "created", label: "Listing created" },
  { key: "funded", label: "Buyer deposited funds" },
  { key: "delivered", label: "Delivery simulated" },
  { key: "released", label: "Funds released to seller" },
];

function stepIndex(status: EscrowStatus, delivered: boolean): number {
  if (status === "released") return 3;
  if (delivered) return 2;
  if (status === "funded") return 1;
  return 0;
}

export default function EscrowTimeline({ status, delivered }: { status: EscrowStatus; delivered: boolean }) {
  const current = stepIndex(status, delivered);

  return (
    <ol className="flex flex-col gap-2">
      {STEPS.map((step, idx) => {
        const done = idx <= current;
        return (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                done
                  ? "bg-emerald-400 border-emerald-400 text-black"
                  : "border-neutral-600 text-neutral-500"
              }`}
            >
              {done ? "✓" : idx + 1}
            </span>
            <span className={done ? "text-neutral-100" : "text-neutral-500"}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
