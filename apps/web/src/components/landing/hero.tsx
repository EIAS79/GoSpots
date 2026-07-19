"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Compass, Crown, Sparkles } from "lucide-react";
import Link from "next/link";
import { Magnetic } from "@/components/effects/magnetic";
import { cn } from "@/lib/cn";
import { trustIcons } from "@/lib/mock-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { HeroCollage } from "./hero-collage";
import { LivePreview } from "./live-preview";
import { type Mode, useMode } from "./mode-context";
import { VenueFinder } from "./venue-finder";

const accentByMode: Record<Mode, "cyan" | "emerald"> = {
  manage: "emerald",
  play: "cyan",
};

const ctaHrefs: Record<
  Mode,
  { primary: string; secondary: string }
> = {
  manage: { primary: "/register", secondary: "/login" },
  play: { primary: "/venues", secondary: "/register" },
};

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

export function Hero() {
  const { mode, setMode } = useMode();
  const { t } = usePublicPrefs();
  const reduced = useReducedMotion();
  const prefix = mode === "manage" ? "hero.manage" : "hero.play";
  const c = {
    badge: t(`${prefix}.badge`),
    titleA: t(`${prefix}.titleA`),
    titleB: t(`${prefix}.titleB`),
    subtitle: t(`${prefix}.subtitle`),
    ctaPrimary: {
      label: t(`${prefix}.ctaPrimary`),
      href: ctaHrefs[mode].primary,
    },
    ctaSecondary: {
      label: t(`${prefix}.ctaSecondary`),
      href: ctaHrefs[mode].secondary,
    },
    accent: accentByMode[mode],
    pillars: [
      t(`${prefix}.pillar1`),
      t(`${prefix}.pillar2`),
      t(`${prefix}.pillar3`),
    ],
  };

  return (
    <section className="relative isolate overflow-hidden pt-24 sm:pt-28 md:pt-32">
      {/* Full-bleed venue photo collage + scrims (parallax handled inside) */}
      <HeroCollage />

      {/* Mode accent wash — crossfades emerald ↔ cyan when switching audience */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`tint-${mode}`}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "pointer-events-none absolute inset-0 -z-[5]",
            c.accent === "cyan"
              ? "bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.14),transparent_60%)]"
              : "bg-[radial-gradient(ellipse_at_top,_rgba(52,211,153,0.14),transparent_60%)]",
          )}
        />
      </AnimatePresence>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <ModeSwitcher mode={mode} setMode={setMode} />

        <div className="mx-auto mt-7 flex max-w-3xl flex-col items-center text-center sm:mt-9">
          <AnimatePresence mode="wait">
            <motion.span
              key={`badge-${mode}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-md sm:text-xs",
                c.accent === "cyan"
                  ? "border-cyan-400/35 bg-cyan-500/15 text-cyan-200"
                  : "border-emerald-400/35 bg-emerald-500/15 text-emerald-200",
              )}
            >
              <Sparkles size={13} className={reduced ? "" : "animate-pulse-soft"} />
              {c.badge}
            </motion.span>
          </AnimatePresence>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.06] tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)] sm:mt-7 sm:text-5xl md:text-6xl lg:text-7xl">
            <AnimatePresence mode="wait">
              <motion.span key={`title-${mode}`} exit={{ opacity: 0, y: -10 }}>
                {reduced ? (
                  <span className="block">{c.titleA}</span>
                ) : (
                  <StaggeredLine text={c.titleA} />
                )}
                {/* Gradient line stays a single block: transforms on child
                    spans would break background-clip: text rendering. */}
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
              </motion.span>
            </AnimatePresence>
          </h1>

          <AnimatePresence mode="wait">
            <motion.p
              key={`sub-${mode}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="mt-5 max-w-xl text-balance text-sm text-zinc-300 sm:mt-6 sm:text-base md:text-lg"
            >
              {c.subtitle}
            </motion.p>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={`cta-${mode}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mt-8 flex w-full flex-col items-center gap-3 sm:mt-9 sm:w-auto sm:flex-row"
            >
              <Magnetic className="w-full sm:w-auto">
                <Link
                  href={c.ctaPrimary.href}
                  className={cn(
                    "group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-semibold text-zinc-950 transition sm:w-auto",
                    c.accent === "cyan"
                      ? "bg-cyan-400 shadow-[0_20px_60px_-15px_rgba(56,189,248,0.55)] hover:shadow-[0_24px_70px_-15px_rgba(56,189,248,0.65)]"
                      : "bg-emerald-400 shadow-[0_20px_60px_-15px_rgba(52,211,153,0.55)] hover:shadow-[0_24px_70px_-15px_rgba(52,211,153,0.65)]",
                  )}
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
          </AnimatePresence>

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
            {trustIcons.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-1.5">
                <t.icon size={12} className="text-amber-300/80" />
                {t.label}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Preview panel overlaps the collage fade → hero merges into next section */}
        <div className="relative z-10 mx-auto mt-12 w-full max-w-6xl pb-6 sm:mt-14 md:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={`preview-${mode}`}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {mode === "play" ? <VenueFinder /> : <LivePreview />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function ModeSwitcher({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  /** Owner-first: venue operators appear first */
  const items: { id: Mode; label: string; short: string; icon: typeof Compass }[] = [
    { id: "manage", label: "I run a venue", short: "Run a venue", icon: Crown },
    { id: "play", label: "I'm looking for a spot", short: "Find a spot", icon: Compass },
  ];
  return (
    <div className="mx-auto flex w-fit max-w-full items-center gap-1 rounded-full border border-white/15 bg-zinc-950/55 p-1 backdrop-blur-xl">
      {items.map((it) => {
        const Icon = it.icon;
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setMode(it.id)}
            className={cn(
              "relative inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium transition sm:px-4 sm:text-sm",
              active ? "text-zinc-950" : "text-zinc-300 hover:text-white",
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className={cn(
                  "absolute inset-0 -z-10 rounded-full shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]",
                  it.id === "play"
                    ? "bg-gradient-to-r from-cyan-300 to-cyan-400"
                    : "bg-gradient-to-r from-emerald-300 to-emerald-400",
                )}
              />
            )}
            <Icon size={14} />
            <span className="hidden sm:inline">{it.label}</span>
            <span className="sm:hidden">{it.short}</span>
          </button>
        );
      })}
    </div>
  );
}
