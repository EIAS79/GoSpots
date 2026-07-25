"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BRAND_LOGO_LIGHT_SRC,
  BRAND_LOGO_SRC,
  BRAND_NAME,
  BRAND_TAGLINE,
} from "@/lib/brand";
import { cn } from "@/lib/cn";

/** Full lockup PNG sizes — never use the broken mark crop. */
const sizes = {
  sm: {
    width: 118,
    height: 28,
    tagline: "text-[8px] font-medium uppercase tracking-[0.22em]",
    taglinePad: "pl-9",
  },
  md: {
    width: 152,
    height: 36,
    tagline: "text-[9px] font-medium uppercase tracking-[0.24em]",
    taglinePad: "pl-11",
  },
  lg: {
    width: 186,
    height: 44,
    tagline: "text-[10px] font-medium uppercase tracking-[0.26em]",
    taglinePad: "pl-14",
  },
} as const;

type Size = keyof typeof sizes;

/**
 * Brand chrome: single full lockup PNG (`gospots-logo` / `gospots-logo-light`).
 * Do not stack `gospots-mark.png` — that crop is broken (pin + letter scraps).
 */
export function GoSpotsBrandLockup({
  size = "md",
  showTagline = false,
  href = "/",
  className,
  tone = "auto",
}: {
  size?: Size;
  showTagline?: boolean;
  href?: string;
  className?: string;
  tone?: "auto" | "onDark" | "onLight";
}) {
  const s = sizes[size];

  const taglineTone =
    tone === "onDark"
      ? "text-zinc-400"
      : tone === "onLight"
        ? "text-zinc-600"
        : "text-zinc-500 dark:text-zinc-400";

  const imgClass = "h-full w-auto object-contain object-left";

  const logo =
    tone === "onDark" ? (
      <Image
        src={BRAND_LOGO_LIGHT_SRC}
        alt={BRAND_NAME}
        width={s.width}
        height={s.height}
        sizes={`${s.width}px`}
        priority
        className={imgClass}
      />
    ) : tone === "onLight" ? (
      <Image
        src={BRAND_LOGO_SRC}
        alt={BRAND_NAME}
        width={s.width}
        height={s.height}
        sizes={`${s.width}px`}
        priority
        className={imgClass}
      />
    ) : (
      <>
        <Image
          src={BRAND_LOGO_SRC}
          alt={BRAND_NAME}
          width={s.width}
          height={s.height}
          sizes={`${s.width}px`}
          priority
          className={cn(imgClass, "dark:hidden")}
        />
        <Image
          src={BRAND_LOGO_LIGHT_SRC}
          alt=""
          width={s.width}
          height={s.height}
          sizes={`${s.width}px`}
          priority
          aria-hidden
          className={cn(imgClass, "hidden dark:block")}
        />
      </>
    );

  const inner = (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className="relative inline-flex items-center"
        style={{ height: s.height }}
      >
        {logo}
      </span>
      {showTagline ? (
        <span
          className={cn(
            "whitespace-nowrap",
            taglineTone,
            s.tagline,
            s.taglinePad,
          )}
        >
          {BRAND_TAGLINE}
        </span>
      ) : null}
    </span>
  );

  return (
    <Link
      href={href}
      aria-label={BRAND_NAME}
      className={cn(
        "inline-flex max-w-full transition-opacity hover:opacity-95",
        className,
      )}
    >
      {inner}
    </Link>
  );
}
