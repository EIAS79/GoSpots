"use client";

import { motion } from "framer-motion";
import { ArrowRight, Compass } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/effects/reveal";
import { Spotlight } from "@/components/effects/spotlight";
import { ownerSteps } from "@/lib/mock-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useMode } from "./mode-context";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Owner onboarding steps — rendered only in the "manage" view.
 * The play view gets its own player-focused sections instead.
 */
export function Audience() {
  const { setMode } = useMode();
  const { t } = usePublicPrefs();

  return (
    <section id="how" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="flex flex-col items-center gap-5 text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            {t("how.eyebrow")}
          </span>
          <h2 className="max-w-2xl text-balance text-3xl font-bold leading-tight md:text-5xl">
            {t("how.title")}{" "}
            <span className="text-gradient">{t("how.titleAccent")}</span>
          </h2>
          <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            {t("how.subtitle")}
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {ownerSteps.map((step, i) => {
            const n = i + 1;
            return (
              <motion.div
                key={n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
              >
                <Spotlight className="rounded-2xl">
                  <div className="group relative h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-6 transition-all hover:border-black/20 dark:border-white/10 dark:bg-gradient-to-b dark:from-white/[0.05] dark:to-transparent dark:hover:border-white/20">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="flex items-center justify-between">
                      <span className="relative grid h-11 w-11 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 dark:border-white/10 dark:bg-zinc-900">
                        <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400/20 to-violet-400/20 opacity-0 blur transition-opacity group-hover:opacity-100" />
                        <step.icon size={18} className="relative text-emerald-700 dark:text-emerald-300" />
                      </span>
                      <span className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
                        0{n}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-[var(--color-foreground)] dark:text-white">
                      {t(`how.step${n}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {t(`how.step${n}.body`)}
                    </p>
                  </div>
                </Spotlight>
              </motion.div>
            );
          })}
        </div>

        <Reveal
          delay={0.1}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-5 py-2.5 text-sm font-medium text-[var(--color-foreground)] backdrop-blur transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:text-emerald-200"
          >
            {t("how.ctaPrimary")}
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMode("play")}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm text-zinc-600 transition hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300"
          >
            <Compass size={15} />
            {t("how.ctaSecondary")}
          </button>
        </Reveal>
      </div>
    </section>
  );
}
