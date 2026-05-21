import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-background)] px-4 py-12">
      <div className="aurora-mesh absolute inset-0 -z-10 opacity-60" />
      <div className="aurora-blob aurora-blob-a -z-10 opacity-50" />
      <div className="aurora-blob aurora-blob-b -z-10 opacity-40" />

      <Link
        href="/"
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
      >
        <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-gradient-to-br from-emerald-400 via-amber-400 to-rose-400">
          <span className="grid h-[calc(100%-2px)] w-[calc(100%-2px)] place-items-center rounded-[5px] bg-zinc-950 text-xs font-bold text-emerald-300">
            V
          </span>
        </span>
        GoSpots
      </Link>

      {children}
    </div>
  );
}
