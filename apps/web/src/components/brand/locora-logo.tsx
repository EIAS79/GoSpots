"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { LocoraMark } from "@/components/brand/locora-mark";
import { cn } from "@/lib/cn";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { LOCORA_VIEW_H, LOCORA_VIEW_W } from "@/components/brand/locora-mark-paths";

const sizes = {
  sm: { box: 32, text: "text-sm", tagline: "text-[10px]" },
  md: { box: 40, text: "text-sm", tagline: "text-xs" },
  lg: { box: 52, text: "text-lg", tagline: "text-sm" },
} as const;

type Size = keyof typeof sizes;

export function LocoraLogo({
  size = "md",
  showName = true,
  showTagline = false,
  href,
  className,
  animated = true,
  /** onDark = always light text (hero/transparent nav). auto = follows light/dark theme. */
  tone = "auto",
}: {
  size?: Size;
  showName?: boolean;
  showTagline?: boolean;
  href?: string;
  className?: string;
  animated?: boolean;
  tone?: "auto" | "onDark" | "onLight";
}) {
  const s = sizes[size];
  const nameTone =
    tone === "onDark"
      ? "text-white"
      : tone === "onLight"
        ? "text-zinc-900"
        : "text-[var(--color-foreground)]";
  const taglineTone =
    tone === "onDark"
      ? "text-zinc-300"
      : tone === "onLight"
        ? "text-zinc-600"
        : "text-[color-mix(in_srgb,var(--color-foreground)_58%,transparent)]";
  const mark = (
    <motion.span
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        animated &&
          "drop-shadow-[0_0_16px_color-mix(in_srgb,var(--app-accent)_35%,transparent)] dark:drop-shadow-[0_0_22px_color-mix(in_srgb,var(--app-accent)_55%,transparent)]",
      )}
      style={{
        width: s.box,
        height: Math.round(s.box * (LOCORA_VIEW_H / LOCORA_VIEW_W)),
      }}
      whileHover={animated ? { scale: 1.08, rotate: -2 } : undefined}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
    >
      {animated && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full blur-md bg-[color-mix(in_srgb,var(--app-accent)_28%,transparent)] dark:bg-[color-mix(in_srgb,var(--app-accent)_38%,transparent)]"
          animate={{ opacity: [0.3, 0.65, 0.3], scale: [0.85, 1.12, 0.85] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <LocoraMark size={s.box} animated={animated} className="relative z-10" />
    </motion.span>
  );

  const inner = (
    <>
      {mark}
      {(showName || showTagline) && (
        <span className="flex min-w-0 flex-col leading-tight">
          {showName && (
            <span
              className={cn(
                "font-semibold tracking-tight transition-colors",
                nameTone,
                s.text,
              )}
            >
              {BRAND_NAME}
            </span>
          )}
          {showTagline && (
            <span className={cn("transition-colors", taglineTone, s.tagline)}>
              {BRAND_TAGLINE}
            </span>
          )}
        </span>
      )}
    </>
  );

  const classes = cn("inline-flex items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} className={cn(classes, "transition-opacity hover:opacity-95")}>
        {inner}
      </Link>
    );
  }

  return <span className={classes}>{inner}</span>;
}
