import type { ReactNode } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-background)] px-4 py-12">
      <div className="aurora-mesh absolute inset-0 -z-10 opacity-60" />
      <div className="aurora-blob aurora-blob-a -z-10 opacity-50" />
      <div className="aurora-blob aurora-blob-b -z-10 opacity-40" />

      <GoSpotsLogo
        href="/"
        size="sm"
        showTagline
        className="absolute left-6 top-6 text-zinc-400 transition hover:opacity-90"
      />

      {children}
    </div>
  );
}
