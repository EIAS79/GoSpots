"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  BRAND_ICON_SRC,
  BRAND_LOGO_LIGHT_SRC,
  BRAND_LOGO_SRC,
  BRAND_NAME,
  BRAND_TAGLINE,
} from "@/lib/brand";

/** Horizontal lockup sizes (icon + wordmark baked into one PNG). */
const sizes = {
  sm: {
    height: 28,
    width: 118,
    tagline: "text-[8px] font-medium uppercase tracking-[0.22em]",
    /** Indent tagline under wordmark, past the pin */
    taglineIndent: "pl-9",
  },
  md: {
    height: 36,
    width: 152,
    tagline: "text-[9px] font-medium uppercase tracking-[0.24em]",
    taglineIndent: "pl-11",
  },
  lg: {
    height: 44,
    width: 186,
    tagline: "text-[10px] font-medium uppercase tracking-[0.26em]",
    taglineIndent: "pl-14",
  },
} as const;

type Size = keyof typeof sizes;

/**
 * Brand chrome: single lockup PNG (pin + GoSpots).
 * Never stack a separate mark next to this — the pin is already in the file.
 * Use `markOnly` only for tiny icon spots (not nav/footer) — uses app icon, not the broken mark crop.
 */
export function LocoraLogo({
  size = "md",
  showName: _showName = true,
  showTagline = false,
  markOnly = false,
  href,
  className,
  animated = true,
  /** onDark = light wordmark PNG. onLight = dark wordmark. auto = theme-aware pair. */
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
      ? "text-zinc-400"
      : tone === "onLight"
        ? "text-zinc-600"
        : "text-[color-mix(in_srgb,var(--color-foreground)_58%,transparent)]";

  const logoImage =
    tone === "onDark" ? (
      <Image
        src={BRAND_LOGO_LIGHT_SRC}
        alt={BRAND_NAME}
        width={s.width}
        height={s.height}
        sizes={`${s.width}px`}
        className="h-full w-auto object-contain object-left"
        priority
      />
    ) : tone === "onLight" ? (
      <Image
        src={BRAND_LOGO_SRC}
        alt={BRAND_NAME}
        width={s.width}
        height={s.height}
        sizes={`${s.width}px`}
        className="h-full w-auto object-contain object-left"
        priority
      />
    ) : (
      <>
        <Image
          src={BRAND_LOGO_SRC}
          alt={BRAND_NAME}
          width={s.width}
          height={s.height}
          sizes={`${s.width}px`}
          className="h-full w-auto object-contain object-left dark:hidden"
          priority
        />
        <Image
          src={BRAND_LOGO_LIGHT_SRC}
          alt=""
          width={s.width}
          height={s.height}
          sizes={`${s.width}px`}
          className="hidden h-full w-auto object-contain object-left dark:block"
          aria-hidden
          priority
        />
      </>
    );

  const mark = markOnly ? (
    <motion.span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-lg",
        animated &&
          "drop-shadow-[0_0_16px_color-mix(in_srgb,var(--app-accent)_35%,transparent)]",
      )}
      style={{ height: s.height, width: s.height }}
      whileHover={animated ? { scale: 1.03 } : undefined}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
    >
      <Image
        src={BRAND_ICON_SRC}
        alt={BRAND_NAME}
        width={s.height}
        height={s.height}
        sizes={`${s.height}px`}
        className="h-full w-full object-contain"
        priority
      />
    </motion.span>
  ) : (
    <motion.span
      className={cn(
        "inline-flex flex-col items-start gap-0.5",
        animated && "transition-opacity",
      )}
      whileHover={animated ? { opacity: 0.92 } : undefined}
    >
      <span
        className="relative inline-flex items-center"
        style={{ height: s.height }}
      >
        {logoImage}
      </span>
      {showTagline ? (
        <span
          className={cn(
            "whitespace-nowrap",
            taglineTone,
            s.tagline,
            s.taglineIndent,
          )}
        >
          {BRAND_TAGLINE}
        </span>
      ) : null}
    </motion.span>
  );

  const classes = cn("inline-flex max-w-full items-center", className);

  if (href) {
    return (
      <Link
        href={href}
        className={cn(classes, "transition-opacity hover:opacity-95")}
        aria-label={BRAND_NAME}
      >
        {mark}
      </Link>
    );
  }

  return <span className={classes}>{mark}</span>;
}

/** Preferred alias — same as LocoraLogo. */
export { LocoraLogo as GoSpotsLogo };
