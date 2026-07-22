import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr/ShieldCheck";

export default function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10">
        <ShieldCheckIcon size={17} weight="fill" className="text-sky-400" />
      </span>
      {withWordmark && <span className="font-semibold tracking-tight text-[15px]">TrustLayer</span>}
    </span>
  );
}
