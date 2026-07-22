"use client";

import { Marquee } from "@/components/effects/marquee";
import { usePublicPrefs } from "@/lib/public-prefs-context";

const OWNER_KEYS = [
  "marquee.owner.1",
  "marquee.owner.2",
  "marquee.owner.3",
  "marquee.owner.4",
  "marquee.owner.5",
  "marquee.owner.6",
  "marquee.owner.7",
  "marquee.owner.8",
] as const;

export function MarqueeBar() {
  const { t } = usePublicPrefs();

  return (
    <section className="relative border-y border-[var(--color-border)] bg-[var(--color-surface)]/40 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          {t("marquee.owner.title")}
        </p>
        <Marquee duration={56}>
          {OWNER_KEYS.map((key) => (
            <span
              key={key}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2 text-xs text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400"
            >
              <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
              {t(key)}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
