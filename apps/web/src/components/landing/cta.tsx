"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Magnetic } from "@/components/effects/magnetic";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useCompactViewport } from "@/lib/use-compact-viewport";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Owner CTA — primary register; secondary guest directory. */
export function Cta() {
  const reduce = useReducedMotion();
  const compact = useCompactViewport();
  const light = Boolean(reduce || compact);
  const { t } = usePublicPrefs();
  const prefix = "cta.manage";
  const c = {
    titleA: t(`${prefix}.titleA`),
    titleB: t(`${prefix}.titleB`),
    body: t(`${prefix}.body`),
    note: t(`${prefix}.note`),
    primary: { label: t(`${prefix}.primary`), href: "/register" },
    secondary: { label: t(`${prefix}.secondary`), href: "/venues" },
    glowA: "bg-emerald-500/25",
    glowB: "bg-amber-500/15",
  };

  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <motion.div
          initial={light ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: light ? 0 : 0.55, ease: EASE }}
          className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-8 md:p-14"
        >
          {!light && (
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

          <div className="relative flex flex-col items-center text-center">
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
          </div>
        </motion.div>
      </div>
    </section>
  );
}
