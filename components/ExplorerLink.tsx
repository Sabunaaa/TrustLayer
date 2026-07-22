"use client";

export default function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 hover:text-sky-300 underline underline-offset-2 text-sm"
    >
      {children} ↗
    </a>
  );
}
