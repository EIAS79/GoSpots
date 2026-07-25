"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  CircleCheck,
  CircleDollarSign,
  CircleDot,
  Pause,
  Play,
  Sparkles,
  Square,
  Timer,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { liveTables, type LiveTable } from "@/lib/mock-data";
import { useMotionCapability } from "@/lib/motion-capability";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useActiveWhenVisible } from "@/lib/use-active-when-visible";

function useTickerPool() {
  const { formatMoney } = usePublicPrefs();
  return useMemo(
    () =>
      [
        { icon: Timer, text: "Table 5 · session started", tone: "emerald" as const },
        {
          icon: CircleDollarSign,
          text: `Bill paid · ${formatMoney(82.4)}`,
          tone: "amber" as const,
        },
        {
          icon: Users,
          text: "Reservation · 4 people · 21:00",
          tone: "cyan" as const,
        },
        {
          icon: CircleCheck,
          text: `Shift closed · ${formatMoney(1284)} today`,
          tone: "emerald" as const,
        },
        { icon: Sparkles, text: "2× Coke added to Table 3", tone: "violet" as const },
        { icon: Timer, text: "Snooker 1 · 1h 27m", tone: "amber" as const },
      ] as const,
    [formatMoney],
  );
}

const tickerTones = {
  emerald:
    "border-emerald-500/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100",
  amber:
    "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100",
  cyan:
    "border-sky-500/35 bg-sky-500/15 text-sky-950 dark:border-cyan-400/40 dark:bg-cyan-500/15 dark:text-cyan-100",
  violet:
    "border-violet-500/35 bg-violet-500/15 text-violet-950 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-100",
} as const;

const statusStyles: Record<LiveTable["status"], string> = {
  available:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-300",
  busy:
    "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/5 dark:text-amber-300",
  reserved:
    "border-sky-500/35 bg-sky-500/10 text-sky-950 dark:border-cyan-500/40 dark:bg-cyan-500/5 dark:text-cyan-300",
  maintenance:
    "border-zinc-400/50 bg-zinc-500/10 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500",
};

const statusLabel: Record<LiveTable["status"], string> = {
  available: "Available",
  busy: "Playing",
  reserved: "Reserved",
  maintenance: "Maintenance",
};

function fmtTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function LivePreview() {
  const { formatMoney } = usePublicPrefs();
  const cap = useMotionCapability();
  const compact = cap === "compact" || cap === "reduced";
  const rootRef = useRef<HTMLDivElement>(null);
  const liveActive = useActiveWhenVisible(rootRef);
  const tickerPool = useTickerPool();
  const [tick, setTick] = useState(0);
  const [tickerIdx, setTickerIdx] = useState(0);
  // Static on phones / reduced; pause intervals when offscreen.
  useEffect(() => {
    if (compact || !liveActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [compact, liveActive]);
  useEffect(() => {
    if (compact || !liveActive) return;
    const id = setInterval(
      () => setTickerIdx((i) => (i + 1) % tickerPool.length),
      3200,
    );
    return () => clearInterval(id);
  }, [compact, liveActive, tickerPool.length]);
  const ticker = tickerPool[tickerIdx];

  const tables = liveTables.map((t) => {
    if (t.status === "busy" && typeof t.minutes === "number") {
      const minutes = t.minutes + Math.floor(tick / 6);
      const amount = +(minutes * (t.rate / 60)).toFixed(2);
      return { ...t, minutes, amount };
    }
    return t;
  });

  const busyTables = tables.filter((t) => t.status === "busy");
  const total = tables.length;
  const occupancy = Math.round((busyTables.length / total) * 100);
  const revenue = busyTables.reduce((sum, t) => sum + (t.amount ?? 0), 0);

  return (
    <div ref={rootRef} className="relative w-full">
      <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Illustrative operations UI · demo numbers
      </p>
      <div
        className={cn(
          "absolute inset-x-0 -inset-y-10 -z-10 rounded-[40px] bg-gradient-to-br from-amber-400/20 via-orange-400/10 to-rose-400/15 sm:-inset-x-4 dark:from-emerald-500/20 dark:via-cyan-500/10 dark:to-violet-500/20",
          compact ? "opacity-70" : "blur-2xl",
        )}
      />

      <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/70 px-4 py-3 sm:px-5 dark:border-white/5 dark:bg-zinc-900/60">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400/80" />
            <span className="ml-2 truncate text-xs text-zinc-500 sm:ml-3">
              gospots.eu / operations
            </span>
          </div>
          <div className="hidden items-center gap-2 text-xs text-zinc-600 sm:flex dark:text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 dark:bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            </span>
            Live · Mokotów branch
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute right-4 top-14 z-10 hidden sm:block"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={tickerIdx}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur",
                tickerTones[ticker.tone],
              )}
            >
              <ticker.icon size={12} />
              {ticker.text}
              <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[var(--color-border)] px-4 py-4 text-sm sm:grid-cols-3 sm:px-5 dark:border-white/5">
          <Stat
            label="Active sessions"
            value={`${busyTables.length} / ${total}`}
            tone="emerald"
          />
          <Stat label="Occupancy" value={`${occupancy}%`} tone="cyan" />
          <Stat
            label="Open revenue"
            value={formatMoney(revenue)}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 md:grid-cols-3 lg:grid-cols-4">
          {tables.map((t, i) => (
            <motion.div
              key={t.id}
              initial={compact ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: compact ? 0 : 0.4,
                delay: compact ? 0 : i * 0.04,
              }}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-[var(--color-surface-2)]/50 p-3 transition-all dark:bg-zinc-900/60",
                statusStyles[t.status],
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {t.type}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-[var(--color-foreground)] dark:text-white">
                    {t.name}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    statusStyles[t.status],
                  )}
                >
                  {t.status === "maintenance" ? "Maint." : statusLabel[t.status]}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div className="font-mono text-lg text-[var(--color-foreground)] tabular-nums dark:text-white">
                  <AnimatePresence mode="wait">
                    {t.status === "busy" && t.minutes !== undefined ? (
                      <motion.span
                        key={t.minutes}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="inline-block"
                      >
                        {fmtTime(t.minutes)}
                      </motion.span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-600">--:--</span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-zinc-500">Bill</p>
                  <p className="text-sm font-semibold text-[var(--color-foreground)] tabular-nums dark:text-white">
                    {t.status === "busy" && t.amount !== undefined
                      ? formatMoney(t.amount)
                      : `${formatMoney(t.rate)}/h`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {t.status === "busy" ? (
                  <>
                    <ActionPill>
                      <Pause size={11} /> Pause
                    </ActionPill>
                    <ActionPill tone="rose">
                      <Square size={11} /> End
                    </ActionPill>
                  </>
                ) : t.status === "available" ? (
                  <ActionPill tone="emerald">
                    <Play size={11} /> Start
                  </ActionPill>
                ) : t.status === "reserved" ? (
                  <ActionPill tone="cyan">
                    <CircleDot size={11} /> Check-in
                  </ActionPill>
                ) : (
                  <ActionPill tone="zinc">
                    <Activity size={11} /> Disabled
                  </ActionPill>
                )}
              </div>

              {t.status === "busy" && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent"
                  aria-hidden
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "cyan" | "violet";
}) {
  const toneClass = {
    emerald: "text-emerald-800 dark:text-emerald-300",
    cyan: "text-sky-800 dark:text-cyan-300",
    violet: "text-violet-800 dark:text-violet-300",
  }[tone];
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}

function ActionPill({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "emerald" | "rose" | "cyan" | "zinc";
}) {
  const tones = {
    emerald:
      "border-emerald-600/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
    rose:
      "border-rose-600/35 bg-rose-500/15 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
    cyan:
      "border-sky-600/35 bg-sky-500/15 text-sky-900 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200",
    zinc:
      "border-[var(--color-border)] bg-black/5 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
