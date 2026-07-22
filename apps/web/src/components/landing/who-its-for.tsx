"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Gamepad2,
  Layers,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/effects/reveal";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import {
  SELF_SERVE_PACK_LIST,
  type SelfServePackId,
} from "@/lib/venue-packs";

const EASE = [0.22, 1, 0.36, 1] as const;

const PACK_ICONS: Record<SelfServePackId, LucideIcon> = {
  gaming: Gamepad2,
  mixed: Layers,
};

const PACK_GLOW: Record<SelfServePackId, string> = {
  gaming: "from-cyan-500/25 to-cyan-500/0",
  mixed: "from-violet-500/25 to-violet-500/0",
};

const PACK_ICON_TONE: Record<SelfServePackId, string> = {
  gaming: "text-cyan-700 dark:text-cyan-300",
  mixed: "text-violet-700 dark:text-violet-300",
};

const PACK_EXAMPLE_COUNTS: Record<SelfServePackId, number> = {
  gaming: 5,
  mixed: 3,
};

/**
 * Owner view — gaming-first ICP (#33). Self-serve: gaming + mixed.
 * Restaurant / hotel → contact sales (not co-equal product tiles).
 */
export function WhoItsFor() {
  const { t, formatMoney } = usePublicPrefs();
  return (
    <section id="who" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            {t("who.eyebrow")}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            {t("who.title")}{" "}
            <span className="text-gradient">{t("who.titleAccent")}</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            {t("who.subtitle")}
          </p>
        </Reveal>

        <div className="mt-12 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {SELF_SERVE_PACK_LIST.map((pack, i) => {
            const id = pack.id as SelfServePackId;
            const Icon = PACK_ICONS[id];
            const exampleCount = PACK_EXAMPLE_COUNTS[id];
            const hero = id === "gaming";

            return (
              <motion.article
                key={pack.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}
                className={cn(
                  "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400/30 dark:border-white/10 dark:bg-white/[0.03] sm:p-6",
                  hero ? "sm:col-span-2 lg:col-span-2" : "lg:col-span-2",
                )}
              >
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br blur-3xl transition-opacity duration-500",
                    PACK_GLOW[id],
                    "opacity-40 group-hover:opacity-80",
                  )}
                />

                <div className="relative flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 dark:border-white/10 dark:bg-zinc-900/80",
                        PACK_ICON_TONE[id],
                      )}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      {formatMoney(0)}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-semibold text-[var(--color-foreground)] dark:text-white sm:text-xl">
                    {t(`pack.${pack.id}.name`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {t(`pack.${pack.id}.tagline`)}
                  </p>

                  <ul className="mt-auto flex flex-wrap gap-1.5 pt-5">
                    {Array.from({ length: exampleCount }, (_, idx) => {
                      const key = `who.ex.${pack.id}.${idx + 1}`;
                      return (
                        <li
                          key={key}
                          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-2.5 py-1 text-[11px] text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
                        >
                          {t(key)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </motion.article>
            );
          })}

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.12, ease: EASE }}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 backdrop-blur dark:border-white/15 dark:bg-white/[0.02] sm:col-span-2 sm:p-6 lg:col-span-1"
          >
            <div className="relative flex flex-1 flex-col">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 text-rose-700 dark:border-white/10 dark:bg-zinc-900/80 dark:text-rose-300">
                <UtensilsCrossed size={20} />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[var(--color-foreground)] dark:text-white sm:text-xl">
                {t("who.contact.title")}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t("who.contact.body")}
              </p>
              <a
                href="mailto:hello@locora.app"
                className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                {t("who.talkToUs")}
                <ArrowRight size={14} />
              </a>
            </div>
          </motion.article>
        </div>

        <Reveal delay={0.1} className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-[0_20px_60px_-15px_rgba(52,211,153,0.55)] transition hover:bg-emerald-300"
          >
            {t("who.cta")}
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
          <p className="max-w-md text-center text-xs text-zinc-500">
            {t("who.noteLead")}{" "}
            <a
              href="mailto:hello@locora.app"
              className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              {t("who.talkToUs")}
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
