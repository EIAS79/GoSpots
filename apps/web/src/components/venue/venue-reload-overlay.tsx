"use client";

import { Loader2 } from "lucide-react";

export function VenueReloadOverlay({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-zinc-950/95 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-10 animate-spin text-emerald-400" />
      <p className="max-w-sm text-center text-sm text-zinc-300">{message}</p>
    </div>
  );
}
