"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Magnetic } from "@/components/effects/magnetic";
import { cn } from "@/lib/cn";
import { trustIcons } from "@/lib/mock-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { HeroCollage } from "./hero-collage";
import { LivePreview } from "./live-preview";

/** Word-by-word staggered headline line. */
function StaggeredLine({
  text,
  className,
  baseDelay = 0,
}: {
  text: string;
  className?: string;
  baseDelay?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={cn("block", className)}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{
            duration: 0.45,
            delay: baseDelay + i * 0.05,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="inline-block whitespace-pre"
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Owner-primary hero. Primary CTA → register; secondary → guest directory `/venues`.
 * Dual manage/play mode switcher removed so the homepage does not fight both stories.
 */
export function Hero() {
  const { t } = usePublicPrefs();
  const reduced = useReducedMotion();
  const prefix = "hero.manage";
  const c = {
    badge: t(`${prefix}.badge`),
    titleA: t(`${prefix}.titleA`),
    titleB: t(`${prefix}.titleB`),
    subtitle: t(`${prefix}.subtitle`),
    ctaPrimary: {
      label: t(`${prefix}.ctaPrimary`),
      href: "/register",
    },
    ctaSecondary: {
      label: t(`${prefix}.ctaSecondary`),
      href: "/venues",
    },
    pillars: [
      t(`${prefix}.pillar1`),
      t(`${prefix}.pillar2`),
      t(`${prefix}.pillar3`),
    ],
  };

  return (
    <section className="relative isolate overflow-hidden pt-24 sm:pt-28 md:pt-32">
      <HeroCollage />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[5] bg-[radial-gradient(ellipse_at_top,_rgba(52,211,153,0.14),transparent_60%)]"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="mx-auto mt-2 flex max-w-3xl flex-col items-center text-center sm:mt-4">
          <motion.span
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-200 backdrop-blur-md sm:text-xs"
          >
            <Sparkles size={13} className={reduced ? "" : "animate-pulse-soft"} />
            {c.badge}
          </motion.span>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.06] tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)] sm:mt-7 sm:text-5xl md:text-6xl lg:text-7xl">
            {reduced ? (
              <span className="block">{c.titleA}</span>
            ) : (
              <StaggeredLine text={c.titleA} />
            )}
            <motion.span
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: reduced ? 0 : 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="text-gradient animate-shine block"
            >
              {c.titleB}
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-5 max-w-xl text-balance text-sm text-zinc-300 sm:mt-6 sm:text-base md:text-lg"
          >
            {c.subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-8 flex w-full flex-col items-center gap-3 sm:mt-9 sm:w-auto sm:flex-row"
          >
            <Magnetic className="w-full sm:w-auto">
              <Link
                href={c.ctaPrimary.href}
                className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-[0_20px_60px_-15px_rgba(52,211,153,0.55)] transition hover:shadow-[0_24px_70px_-15px_rgba(52,211,153,0.65)] sm:w-auto"
              >
                <span className="relative z-10">{c.ctaPrimary.label}</span>
                <ArrowRight
                  size={16}
                  className="relative z-10 transition-transform group-hover:translate-x-1"
                />
                {!reduced && (
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                )}
              </Link>
            </Magnetic>
            <Link
              href={c.ctaSecondary.href}
              className="w-full rounded-full border border-white/20 bg-white/[0.06] px-6 py-3 text-center text-sm font-medium text-zinc-100 backdrop-blur-md transition hover:border-white/35 hover:bg-white/[0.12] sm:w-auto"
            >
              {c.ctaSecondary.label}
            </Link>
          </motion.div>

          <ul className="mt-7 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-400 sm:mt-8 sm:text-xs">
            {c.pillars.map((line) => (
              <li key={line} className="inline-flex items-center gap-2">
                <span
                  className="h-1 w-1 shrink-0 rounded-full bg-amber-400/70"
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>

          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.35 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-400 sm:mt-8 sm:text-xs"
          >
            {trustIcons.map((item, i) => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                <item.icon size={12} className="text-amber-300/80" />
                {t(
                  (
                    [
                      "hero.trust.audit",
                      "hero.trust.tenant",
                      "hero.trust.peak",
                      "hero.trust.beta",
                    ] as const
                  )[i] ?? "hero.trust.audit",
                )}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="relative z-10 mx-auto mt-12 w-full max-w-6xl pb-6 sm:mt-14 md:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key="preview-manage"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <LivePreview />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
