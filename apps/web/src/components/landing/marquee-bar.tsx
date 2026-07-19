"use client";

import { Marquee } from "@/components/effects/marquee";
import { cn } from "@/lib/cn";
import { useMode } from "./mode-context";

const ownerCapabilities = [
  "Live floor status",
  "Session timers that stay attached to the table",
  "Walk-ins + reservations in one view",
  "Automatic bills on session end",
  "Staff roles & discount limits",
  "Immutable audit trail",
  "Per-table and per-shift revenue",
  "Built for billiard · snooker · lounges · game cafés",
];

const playerCapabilities = [
  "Billiard halls & snooker clubs",
  "Gaming lounges & esports cafés",
  "Restaurants, cafés & bars",
  "Karaoke, bowling & night clubs",
  "Search by city and category",
  "Reserve when the venue enables it",
  "Each venue's own prices & rules",
  "Free for guests — always",
];

export function MarqueeBar() {
  const { mode } = useMode();
  const isPlay = mode === "play";
  const capabilities = isPlay ? playerCapabilities : ownerCapabilities;

  return (
    <section className="relative border-y border-[var(--color-border)] bg-[var(--color-surface)]/40 py-8 dark:border-white/[0.06] dark:bg-zinc-950/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          {isPlay
            ? "What you can find on GoSpots"
            : "What GoSpots is designed to handle"}
        </p>
        <Marquee duration={56} key={mode}>
          {capabilities.map((label) => (
            <span
              key={label}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2 text-xs text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400"
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  isPlay ? "bg-cyan-400/70" : "bg-emerald-400/70",
                )}
              />
              {label}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
