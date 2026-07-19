"use client";

import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Compass, HeartHandshake } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/effects/reveal";
import { Spotlight } from "@/components/effects/spotlight";
import { playerSteps } from "@/lib/mock-data";

const EASE = [0.22, 1, 0.36, 1] as const;

const promises = [
  {
    title: "Always free for guests",
    description:
      "Venues pay for their tools — you never pay GoSpots to browse, discover, or reserve.",
    icon: HeartHandshake,
  },
  {
    title: "Real venues, real info",
    description:
      "Every listing is managed by the venue itself: its own photos, hours, prices, and rules.",
    icon: BadgeCheck,
  },
  {
    title: "A directory that grows",
    description:
      "We're onboarding operators city by city. New spots appear as soon as they publish.",
    icon: Compass,
  },
];

/** Player-focused "how it works" — rendered only in the play view. */
export function PlayerHighlights() {
  return (
    <section id="how" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-cyan-700 dark:text-cyan-400">
            For guests
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Find it, book it,{" "}
            <span className="text-gradient">enjoy it.</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            Three steps between you and your next night out — no phone calls,
            no guessing if a table, lane, or booth is free.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {playerSteps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
            >
              <Spotlight className="rounded-2xl" color="rgba(56,189,248,0.14)">
                <div className="group relative h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-6 transition-all hover:border-black/20 dark:border-white/10 dark:bg-gradient-to-b dark:from-white/[0.05] dark:to-transparent dark:hover:border-white/20">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="flex items-center justify-between">
                    <span className="relative grid h-11 w-11 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 dark:border-white/10 dark:bg-zinc-900">
                      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-400/20 opacity-0 blur transition-opacity group-hover:opacity-100" />
                      <step.icon size={18} className="relative text-cyan-700 dark:text-cyan-300" />
                    </span>
                    <span className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[var(--color-foreground)] dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {step.description}
                  </p>
                </div>
              </Spotlight>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {promises.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease: EASE }}
                className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 dark:border-white/[0.07] dark:bg-white/[0.02]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                  <Icon size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-foreground)] dark:text-white">{p.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {p.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <Reveal delay={0.12} className="mt-10 flex justify-center">
          <Link
            href="/venues"
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-5 py-2.5 text-sm font-medium text-[var(--color-foreground)] backdrop-blur transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-700 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:text-cyan-200"
          >
            Find spots near me
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
