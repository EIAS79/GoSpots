"use client";

import { motion } from "framer-motion";
import { Reveal } from "@/components/effects/reveal";
import { venuePainPoints } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Even collage grid — 3×2 on desktop, no oversized empty cards.
 */
export function VenuePainPoints() {
  return (
    <section id="venue-problems" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-amber-700 dark:text-amber-300/90">
            Product scenarios
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            The messy nights{" "}
            <span className="text-gradient">GoSpots is built for.</span>
          </h2>
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-500 md:text-base">
            Illustrative problems operators describe — not quotes from customers.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venuePainPoints.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: EASE }}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/55 p-5 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-amber-500/40 dark:border-white/10 dark:bg-gradient-to-b dark:from-white/[0.05] dark:to-transparent dark:hover:border-amber-400/30 sm:p-6",
                )}
              >
                <div
                  className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-amber-400/15 via-stone-400/10 to-transparent opacity-60 blur-2xl transition group-hover:opacity-90 dark:from-amber-500/25 dark:via-orange-500/15"
                  aria-hidden
                />
                <div className="relative flex flex-1 flex-col">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 text-amber-800 dark:border-white/10 dark:bg-zinc-900/80 dark:text-amber-300">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-amber-800/60 dark:text-zinc-600">
                        0{i + 1}
                      </span>
                      <h3 className="mt-0.5 text-base font-semibold text-[var(--color-foreground)] md:text-lg">
                        {item.title}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-400">
                    {item.description}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
