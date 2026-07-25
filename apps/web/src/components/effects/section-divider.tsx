"use client";

import { cn } from "@/lib/cn";

type SectionDividerProps = {
  className?: string;
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose";
};

/**
 * Lightweight static divider — no Framer observer, no persistent glow animation.
 */
export function SectionDivider({
  className,
  tone = "emerald",
}: SectionDividerProps) {
  const toneClass = {
    emerald: "via-emerald-400/55",
    cyan: "via-cyan-400/55",
    violet: "via-violet-400/55",
    amber: "via-amber-400/55",
    rose: "via-rose-400/55",
  }[tone];

  const dotClass = {
    emerald: "bg-emerald-400/90",
    cyan: "bg-cyan-400/90",
    violet: "bg-violet-400/90",
    amber: "bg-amber-400/90",
    rose: "bg-rose-400/90",
  }[tone];

  return (
    <div
      className={cn(
        "pointer-events-none relative mx-auto flex w-full max-w-7xl items-center justify-center px-4 md:px-8",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "h-px w-full bg-gradient-to-r from-transparent to-transparent",
          toneClass,
        )}
      />
      <span className={cn("absolute h-1.5 w-1.5 rounded-full", dotClass)} />
    </div>
  );
}
