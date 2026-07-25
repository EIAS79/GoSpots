"use client";

import { CountUp } from "@/components/effects/count-up";
import {
  SectionReveal,
  SectionRevealItem,
} from "@/components/effects/section-reveal";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { TRIAL_DURATION_DAYS, VENUE_ADD_ON_LIST } from "@/lib/venue-packs";

/** Quick trust numbers — owner view only. */
export function StatsStrip() {
  const { formatMoney, t } = usePublicPrefs();
  const freeLabel = formatMoney(0);

  const stats = [
    {
      value: TRIAL_DURATION_DAYS,
      label: t("stats.days.label"),
      hint: t("stats.days.hint"),
    },
    {
      display: freeLabel,
      label: t("stats.free.label"),
      hint: t("stats.free.hint"),
    },
    {
      value: VENUE_ADD_ON_LIST.length,
      label: t("stats.features.label"),
      hint: t("stats.features.hint"),
    },
    {
      value: 1,
      label: t("stats.screen.label"),
      hint: t("stats.screen.hint"),
    },
  ] as const;

  return (
    <section className="relative py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <SectionReveal
          stagger
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {stats.map((s) => (
            <SectionRevealItem
              key={s.label}
              className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 text-center dark:border-white/[0.07] dark:bg-white/[0.02] sm:p-6"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent"
                aria-hidden
              />
              <p className="text-3xl font-bold tracking-tight text-[var(--color-foreground)] dark:text-white sm:text-4xl">
                {"display" in s && s.display != null ? (
                  s.display
                ) : (
                  <CountUp to={"value" in s ? s.value : 0} duration={1.2} />
                )}
              </p>
              <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:text-sm">
                {s.label}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{s.hint}</p>
            </SectionRevealItem>
          ))}
        </SectionReveal>
      </div>
    </section>
  );
}
