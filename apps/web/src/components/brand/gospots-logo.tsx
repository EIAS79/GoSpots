"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { GoSpotsMark } from "@/components/brand/gospots-mark";
import { cn } from "@/lib/cn";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

const sizes = {
  sm: { box: 32, text: "text-sm", tagline: "text-[10px]" },
  md: { box: 40, text: "text-sm", tagline: "text-xs" },
  lg: { box: 52, text: "text-lg", tagline: "text-sm" },
} as const;

type Size = keyof typeof sizes;

export function GoSpotsLogo({
  size = "md",
  showName = true,
  showTagline = false,
  href,
  className,
  animated = true,
}: {
  size?: Size;
  showName?: boolean;
  showTagline?: boolean;
  href?: string;
  className?: string;
  animated?: boolean;
}) {
  const s = sizes[size];
  const mark = (
    <motion.span
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        animated &&
          "drop-shadow-[0_0_16px_rgba(234,88,12,0.25)] dark:drop-shadow-[0_0_20px_rgba(251,191,36,0.45)]",
      )}
      style={{ width: s.box, height: Math.round(s.box * (56 / 48)) }}
      whileHover={animated ? { scale: 1.08, rotate: -3 } : undefined}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
    >
      {animated && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-amber-400/25 blur-md dark:bg-amber-500/30"
          animate={{ opacity: [0.3, 0.65, 0.3], scale: [0.85, 1.12, 0.85] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <GoSpotsMark size={s.box} animated={animated} className="relative z-10" />
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
                "font-semibold tracking-tight text-zinc-900 dark:text-white",
                s.text,
              )}
            >
              {BRAND_NAME}
            </span>
          )}
          {showTagline && (
            <span className={cn("text-zinc-600 dark:text-zinc-400", s.tagline)}>
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
