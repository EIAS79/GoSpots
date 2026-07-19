"use client";

import { motion } from "framer-motion";
import { CountUp } from "@/components/effects/count-up";
import { TRIAL_DURATION_DAYS, VENUE_ADD_ON_LIST } from "@/lib/venue-packs";

const EASE = [0.22, 1, 0.36, 1] as const;

const stats = [
  {
    value: TRIAL_DURATION_DAYS,
    label: "days free on every new venue",
    hint: "No card required to start",
  },
  {
    value: 0,
    prefix: "€",
    label: "for your venue type — forever",
    hint: "You only pay for features",
  },
  {
    value: VENUE_ADD_ON_LIST.length,
    label: "plug-in features to build from",
    hint: "Switch them on and off anytime",
  },
  {
    value: 1,
    label: "live screen to run the whole floor",
    hint: "Tables, consoles, and bills together",
  },
];

/** Quick trust numbers — owner view only. */
export function StatsStrip() {
  return (
    <section className="relative py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.07, ease: EASE }}
              className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 text-center dark:border-white/[0.07] dark:bg-white/[0.02] sm:p-6"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent"
                aria-hidden
              />
              <p className="text-3xl font-bold tracking-tight text-[var(--color-foreground)] dark:text-white sm:text-4xl">
                <CountUp to={s.value} prefix={s.prefix ?? ""} duration={1.2} />
              </p>
              <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:text-sm">
                {s.label}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{s.hint}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
