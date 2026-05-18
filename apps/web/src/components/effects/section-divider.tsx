"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type SectionDividerProps = {
  className?: string;
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose";
};

export function SectionDivider({
  className,
  tone = "emerald",
}: SectionDividerProps) {
  const toneClass = {
    emerald: "via-emerald-400/60",
    cyan: "via-cyan-400/60",
    violet: "via-violet-400/60",
    amber: "via-amber-400/60",
    rose: "via-rose-400/60",
  }[tone];

  const dotClass = {
    emerald: "bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]",
    cyan: "bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.8)]",
    violet: "bg-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.8)]",
    amber: "bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.8)]",
    rose: "bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.8)]",
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
      <motion.span
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className={cn("absolute h-2 w-2 rounded-full", dotClass)}
      />
    </div>
  );
}
