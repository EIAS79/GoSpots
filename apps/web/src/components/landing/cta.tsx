"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Magnetic } from "@/components/effects/magnetic";
import { cn } from "@/lib/cn";
import { useMode } from "./mode-context";

const EASE = [0.22, 1, 0.36, 1] as const;

const copy = {
  manage: {
    titleA: "Never lose money to",
    titleB: "forgotten timers.",
    body: "Put tables, consoles, and boards on one live grid. Close bills with confidence, see reservations next to walk-ins, and get clear daily revenue reports — without running the night from memory.",
    note: "90-day free trial · pick any features · no card required · nothing charges without your consent.",
    primary: { label: "Create your venue", href: "/register" },
    secondary: { label: "I'm a player — browse venues", href: "/venues" },
    glowA: "bg-emerald-500/25",
    glowB: "bg-violet-500/20",
  },
  play: {
    titleA: "Your next great night",
    titleB: "starts here.",
    body: "Billiards, gaming lounges, restaurants, cafés, bars, karaoke, bowling — search by city and category, check the vibe, and reserve your spot when the venue enables it.",
    note: "Free for guests · no account needed to browse · the directory grows every week.",
    primary: { label: "Browse venues", href: "/venues" },
    secondary: { label: "I run a venue — list it free", href: "/register" },
    glowA: "bg-cyan-500/25",
    glowB: "bg-amber-500/15",
  },
} as const;

export function Cta() {
  const reduce = useReducedMotion();
  const { mode } = useMode();
  const c = copy[mode];

  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: EASE }}
          className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 dark:border-white/10 dark:bg-zinc-950/40 sm:p-8 md:p-14"
        >
          {!reduce && (
            <>
              <motion.div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full blur-3xl",
                  c.glowA,
                )}
                animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.65, 0.45] }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full blur-3xl",
                  c.glowB,
                )}
                animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }}
                transition={{
                  duration: 11,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1,
                }}
              />
            </>
          )}
          <div className="absolute inset-0 -z-0 bg-grid [mask-image:radial-gradient(circle_at_center,black,transparent_75%)] opacity-25" />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="relative flex flex-col items-center text-center"
            >
              <h2 className="text-balance text-3xl font-bold leading-tight sm:text-4xl md:text-6xl">
                {c.titleA} <span className="text-gradient">{c.titleB}</span>
              </h2>
              <p className="mt-5 max-w-2xl text-base text-zinc-700 dark:text-zinc-300 md:text-lg">
                {c.body}
              </p>
              <p className="mt-3 text-sm text-zinc-500">{c.note}</p>
              <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
                <Magnetic>
                  <Link
                    href={c.primary.href}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_20px_60px_-15px_rgba(255,255,255,0.35)] transition hover:bg-zinc-700 sm:w-auto dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    {c.primary.label}
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </Link>
                </Magnetic>
                <Link
                  href={c.secondary.href}
                  className="inline-flex w-full items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-7 py-3.5 text-sm font-medium text-[var(--color-foreground)] backdrop-blur transition hover:bg-black/5 sm:w-auto dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  {c.secondary.label}
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
