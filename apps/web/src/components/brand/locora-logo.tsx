"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  BRAND_LOGO_LIGHT_SRC,
  BRAND_LOGO_SRC,
  BRAND_MARK_SRC,
  BRAND_NAME,
  BRAND_TAGLINE,
} from "@/lib/brand";

/**
 * Horizontal wordmark (icon + “GoSpots”) — keep height readable and
 * reserve enough width so the name never looks cramped.
 * Aspect ~3.14∶1 matches current lockup (1440×459).
 */
const sizes = {
  sm: {
    logoH: 36,
    logoMinW: 120,
    icon: 32,
    /** Indent under the wordmark (past the gold pin). */
    taglineIndent: "ml-10",
    tagline: "text-[8px] font-medium uppercase tracking-[0.22em]",
  },
  md: {
    logoH: 44,
    logoMinW: 150,
    icon: 40,
    taglineIndent: "ml-11 sm:ml-12",
    tagline: "text-[9px] font-medium uppercase tracking-[0.24em]",
  },
  lg: {
    logoH: 56,
    logoMinW: 190,
    icon: 48,
    taglineIndent: "ml-14",
    tagline: "text-[10px] font-medium uppercase tracking-[0.26em]",
  },
} as const;

/** Width ≈ height × horizontal lockup ratio */
const WORDMARK_ASPECT = 3.14;

type Size = keyof typeof sizes;

/**
 * Brand lockup from `/brand/gospots-logo*.png` (icon + GoSpots already in one image).
 * Never place a separate pin next to this — that would double the icon.
 * Use `markOnly` only for tiny chrome that can’t fit the wordmark.
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
  /** onDark = light wordmark. onLight = dark wordmark. auto = theme-aware. */
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

  const height = markOnly ? s.icon : s.logoH;
  const width = markOnly
    ? s.icon
    : Math.round(s.logoH * WORDMARK_ASPECT);

  const imgClass =
    "h-full w-auto max-h-full object-contain object-left";

  const markInner = markOnly ? (
    <Image
      src={BRAND_MARK_SRC}
      alt={BRAND_NAME}
      width={width}
      height={height}
      sizes={`${s.icon}px`}
      className={imgClass}
      priority
    />
  ) : tone === "onDark" ? (
    <Image
      src={BRAND_LOGO_LIGHT_SRC}
      alt={BRAND_NAME}
      width={width}
      height={height}
      sizes={`(max-width: 640px) ${s.logoMinW}px, ${width}px`}
      className={imgClass}
      priority
    />
  ) : tone === "onLight" ? (
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND_NAME}
      width={width}
      height={height}
      sizes={`(max-width: 640px) ${s.logoMinW}px, ${width}px`}
      className={imgClass}
      priority
    />
  ) : (
    <>
      <Image
        src={BRAND_LOGO_SRC}
        alt={BRAND_NAME}
        width={width}
        height={height}
        sizes={`(max-width: 640px) ${s.logoMinW}px, ${width}px`}
        className={cn(imgClass, "dark:hidden")}
        priority
      />
      <Image
        src={BRAND_LOGO_LIGHT_SRC}
        alt=""
        aria-hidden
        width={width}
        height={height}
        sizes={`(max-width: 640px) ${s.logoMinW}px, ${width}px`}
        className={cn(imgClass, "hidden dark:block")}
        priority
      />
    </>
  );

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
      {markInner}
    </motion.span>
  );

  const inner = showTagline ? (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      {mark}
      <span
        className={cn(
          "whitespace-nowrap transition-colors",
          s.taglineIndent,
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
    !markOnly && "min-w-[7.5rem] sm:min-w-[9.5rem]",
    size === "lg" && !markOnly && "min-w-[11rem]",
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
