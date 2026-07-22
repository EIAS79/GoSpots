"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  BRAND_ICON_SRC,
  BRAND_LOGO_SRC,
  BRAND_NAME,
  BRAND_TAGLINE,
} from "@/lib/brand";

/**
 * Horizontal wordmark (icon + “GoSpots”) — keep height readable and
 * reserve enough width so the name never looks cramped.
 * Aspect ~4.4∶1 matches a typical icon+wordmark lockup.
 */
const sizes = {
  sm: {
    logoH: 36,
    logoMinW: 150,
    icon: 32,
    tagline: "text-[10px] tracking-wide",
  },
  md: {
    logoH: 44,
    logoMinW: 190,
    icon: 40,
    tagline: "text-xs tracking-wide",
  },
  lg: {
    logoH: 56,
    logoMinW: 240,
    icon: 48,
    tagline: "text-sm tracking-wide",
  },
} as const;

/** Width ≈ height × horizontal lockup ratio */
const WORDMARK_ASPECT = 4.4;

type Size = keyof typeof sizes;

/**
 * Brand mark from `/brand/gospots-logo.png` (horizontal: icon + name).
 * Do not render `{BRAND_NAME}` beside it — that would duplicate the wordmark.
 * Use `markOnly` for tight chrome that should show `/brand/gospots-icon.png` only.
 */
export function LocoraLogo({
  size = "md",
  /** @deprecated Logo asset includes the name; ignored. */
  showName: _showName = false,
  showTagline = false,
  /** Icon-only (no wordmark) — favicon-style mark. */
  markOnly = false,
  href,
  className,
  animated = true,
  /** onDark = always light text (hero/transparent nav). auto = follows light/dark theme. */
  tone = "auto",
}: {
  size?: Size;
  showName?: boolean;
  showTagline?: boolean;
  markOnly?: boolean;
  href?: string;
  className?: string;
  animated?: boolean;
  tone?: "auto" | "onDark" | "onLight";
}) {
  void _showName;
  const s = sizes[size];
  const taglineTone =
    tone === "onDark"
      ? "text-zinc-300"
      : tone === "onLight"
        ? "text-zinc-600"
        : "text-[color-mix(in_srgb,var(--color-foreground)_58%,transparent)]";

  const src = markOnly ? BRAND_ICON_SRC : BRAND_LOGO_SRC;
  const height = markOnly ? s.icon : s.logoH;
  const width = markOnly
    ? s.icon
    : Math.round(s.logoH * WORDMARK_ASPECT);

  const mark = (
    <motion.span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-start",
        animated &&
          "drop-shadow-[0_0_16px_color-mix(in_srgb,var(--app-accent)_35%,transparent)] dark:drop-shadow-[0_0_22px_color-mix(in_srgb,var(--app-accent)_55%,transparent)]",
      )}
      style={
        markOnly
          ? { height, width }
          : { height, minWidth: s.logoMinW, width }
      }
      whileHover={animated ? { scale: 1.03 } : undefined}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
    >
      <Image
        src={src}
        alt={BRAND_NAME}
        width={width}
        height={height}
        sizes={
          markOnly
            ? `${s.icon}px`
            : `(max-width: 640px) ${s.logoMinW}px, ${width}px`
        }
        className="h-full w-auto max-h-full object-contain object-left"
        priority
      />
    </motion.span>
  );

  const inner = showTagline ? (
    <span className="flex min-w-0 flex-col gap-1">
      {mark}
      <span
        className={cn(
          "pl-0.5 transition-colors",
          taglineTone,
          s.tagline,
        )}
      >
        {BRAND_TAGLINE}
      </span>
    </span>
  ) : (
    mark
  );

  const classes = cn(
    "inline-flex max-w-full items-center",
    !markOnly && "min-w-[9.5rem] sm:min-w-[11rem]",
    size === "lg" && !markOnly && "min-w-[13rem]",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(classes, "transition-opacity hover:opacity-95")}
        aria-label={BRAND_NAME}
      >
        {inner}
      </Link>
    );
  }

  return <span className={classes}>{inner}</span>;
}

/** Preferred alias — same as LocoraLogo. */
export { LocoraLogo as GoSpotsLogo };
