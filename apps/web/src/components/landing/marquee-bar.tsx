"use client";

import { Marquee } from "@/components/effects/marquee";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useMode } from "./mode-context";

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

const PLAYER_KEYS = [
  "marquee.player.1",
  "marquee.player.2",
  "marquee.player.3",
  "marquee.player.4",
  "marquee.player.5",
  "marquee.player.6",
  "marquee.player.7",
  "marquee.player.8",
] as const;

export function MarqueeBar() {
  const { mode } = useMode();
  const { t } = usePublicPrefs();
  const isPlay = mode === "play";
  const keys = isPlay ? PLAYER_KEYS : OWNER_KEYS;

  return (
    <section className="relative border-y border-[var(--color-border)] bg-[var(--color-surface)]/40 py-8 dark:border-white/[0.06] dark:bg-zinc-950/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          {isPlay ? t("marquee.player.title") : t("marquee.owner.title")}
        </p>
        <Marquee duration={56} key={mode}>
          {keys.map((key) => (
            <span
              key={key}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2 text-xs text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400"
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  isPlay ? "bg-cyan-400/70" : "bg-emerald-400/70",
                )}
              />
              {t(key)}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
