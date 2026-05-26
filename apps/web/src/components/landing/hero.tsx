"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Crown, Gamepad2, Sparkles } from "lucide-react";
import Link from "next/link";
import { CountUp } from "@/components/effects/count-up";
import { Magnetic } from "@/components/effects/magnetic";
import { cn } from "@/lib/cn";
import { trustIcons } from "@/lib/mock-data";
import { LivePreview } from "./live-preview";
import { type Mode, useMode } from "./mode-context";
import { VenueFinder } from "./venue-finder";

const copy: Record<
  Mode,
  {
    badge: string;
    titleA: string;
    titleB: string;
    subtitle: React.ReactNode;
    ctaPrimary: { label: string; href: string };
    ctaSecondary: { label: string; href: string };
    accent: "cyan" | "emerald";
  }
> = {
  play: {
    badge: "Find your next spot · 240 venues live now",
    titleA: "Find your next",
    titleB: "spot.",
    subtitle: (
      <>
        Billiard halls, gaming lounges, and esports cafés near you —{" "}
        <span className="text-zinc-200">live availability, no waiting.</span>
      </>
    ),
    ctaPrimary: { label: "Find a venue near you", href: "/venues" },
    ctaSecondary: { label: "I run a venue", href: "/dashboard" },
    accent: "cyan",
  },
  manage: {
    badge: "GoSpots for venue owners",
    titleA: "Run your venue",
    titleB: "from one screen.",
    subtitle: (
      <>
        Live sessions. Instant bills. Total control —{" "}
        <span className="text-zinc-200">built for busy nights.</span>
      </>
    ),
    ctaPrimary: { label: "Start your venue free", href: "/dashboard" },
    ctaSecondary: { label: "Browse venues to play", href: "/venues" },
    accent: "emerald",
  },
};

type HeroStat = {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  tone: string;
};

const heroStats: HeroStat[] = [
  { label: "Venues live", value: 240, suffix: "+", tone: "text-emerald-300" },
  {
    label: "Sessions billed",
    value: 1.4,
    decimals: 1,
    suffix: "M",
    tone: "text-cyan-300",
  },
  {
    label: "Cities covered",
    value: 18,
    suffix: "+",
    tone: "text-violet-300",
  },
  {
    label: "Realtime uptime",
    value: 99.98,
    decimals: 2,
    suffix: "%",
    tone: "text-amber-300",
  },
];

export function Hero() {
  const { mode, setMode } = useMode();
  const c = copy[mode];

  return (
    <section className="relative overflow-hidden pt-28 pb-20 md:pt-32 md:pb-24">
      <div className="relative z-10 mx-auto max-w-7xl px-4 md:px-8">
        <ModeSwitcher mode={mode} setMode={setMode} />

        <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center text-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={`badge-${mode}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur",
                c.accent === "cyan"
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              )}
            >
              <Sparkles size={14} className="animate-pulse-soft" />
              {c.badge}
            </motion.span>
          </AnimatePresence>

          <h1 className="mt-7 text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            <AnimatePresence mode="wait">
              <motion.span
                key={`titleA-${mode}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45 }}
                className="block text-zinc-100"
              >
                {c.titleA}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.span
                key={`titleB-${mode}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45, delay: 0.05 }}
                className="text-gradient animate-shine block"
              >
                {c.titleB}
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
              className="mt-6 max-w-xl text-balance text-base text-zinc-400 md:text-lg"
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
              className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
            >
              <Magnetic>
                <Link
                  href={c.ctaPrimary.href}
                  className={cn(
                    "group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-semibold text-zinc-950 transition",
                    c.accent === "cyan"
                      ? "bg-cyan-400 shadow-[0_20px_60px_-15px_rgba(56,189,248,0.6)] hover:shadow-[0_30px_80px_-15px_rgba(56,189,248,0.8)]"
                      : "bg-emerald-400 shadow-[0_20px_60px_-15px_rgba(52,211,153,0.6)] hover:shadow-[0_30px_80px_-15px_rgba(52,211,153,0.8)]",
                  )}
                >
                  <span className="relative z-10">{c.ctaPrimary.label}</span>
                  <ArrowRight
                    size={16}
                    className="relative z-10 transition-transform group-hover:translate-x-1"
                  />
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
              </Magnetic>
              <Magnetic strength={0.25}>
                <Link
                  href={c.ctaSecondary.href}
                  className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-medium text-zinc-200 backdrop-blur transition hover:border-white/30 hover:bg-white/10"
                >
                  {c.ctaSecondary.label}
                </Link>
              </Magnetic>
            </motion.div>
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-zinc-500"
          >
            {trustIcons.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-1.5">
                <t.icon size={12} className="text-emerald-400/80" />
                {t.label}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="relative z-10 mx-auto mt-16 w-full max-w-6xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`preview-${mode}`}
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.97 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {mode === "play" ? <VenueFinder /> : <LivePreview />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-4">
          {heroStats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25 hover:bg-white/[0.06]"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                {s.label}
              </p>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${s.tone}`}>
                <CountUp
                  to={s.value}
                  format={
                    s.decimals != null
                      ? (n) => n.toFixed(s.decimals)
                      : undefined
                  }
                  prefix={s.prefix}
                  suffix={s.suffix}
                />
              </p>
            </motion.div>
          ))}
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
  const items: { id: Mode; label: string; icon: typeof Gamepad2 }[] = [
    { id: "play", label: "I want to play", icon: Gamepad2 },
    { id: "manage", label: "I run a venue", icon: Crown },
  ];
  return (
    <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur">
      {items.map((it) => {
        const Icon = it.icon;
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setMode(it.id)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
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
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
