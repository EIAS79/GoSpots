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
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { liveTables, type LiveTable } from "@/lib/mock-data";

const tickerPool = [
  { icon: Timer, text: "Table 5 · session started", tone: "emerald" },
  { icon: CircleDollarSign, text: "Bill paid · €82.40", tone: "amber" },
  { icon: Users, text: "Reservation · 4 people · 21:00", tone: "cyan" },
  { icon: CircleCheck, text: "Shift closed · €1,284 today", tone: "emerald" },
  { icon: Sparkles, text: "2× Coke added to Table 3", tone: "violet" },
  { icon: Timer, text: "Snooker 1 · 1h 27m", tone: "amber" },
] as const;

const tickerTones = {
  emerald: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
  amber: "border-amber-400/40 bg-amber-500/15 text-amber-100",
  cyan: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
  violet: "border-violet-400/40 bg-violet-500/15 text-violet-100",
} as const;

const statusStyles: Record<LiveTable["status"], string> = {
  available: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  busy: "border-amber-500/40 bg-amber-500/5 text-amber-300",
  reserved: "border-cyan-500/40 bg-cyan-500/5 text-cyan-300",
  maintenance: "border-zinc-700 bg-zinc-900/40 text-zinc-500",
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
  const [tick, setTick] = useState(0);
  const [tickerIdx, setTickerIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(
      () => setTickerIdx((i) => (i + 1) % tickerPool.length),
      3200,
    );
    return () => clearInterval(id);
  }, []);
  const ticker = tickerPool[tickerIdx];

  const tables = liveTables.map((t) => {
    if (t.status === "busy" && typeof t.minutes === "number") {
      const minutes = t.minutes + Math.floor(tick / 6);
      const amount = +(minutes * (t.rate / 60)).toFixed(2);
      return { ...t, minutes, amount };
    }
    return t;
  });

  const active = tables.filter((t) => t.status === "busy");
  const total = tables.length;
  const occupancy = Math.round((active.length / total) * 100);
  const revenue = active.reduce((sum, t) => sum + (t.amount ?? 0), 0);

  return (
    <div className="relative w-full">
      <div className="absolute -inset-x-12 -inset-y-10 -z-10 rounded-[40px] bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-violet-500/20 blur-2xl" />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            <span className="ml-3 text-xs text-zinc-500">
              venueflow.app / operations
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
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

        <div className="grid grid-cols-3 gap-3 border-b border-white/5 px-5 py-4 text-sm">
          <Stat
            label="Active sessions"
            value={`${active.length} / ${total}`}
            tone="emerald"
          />
          <Stat label="Occupancy" value={`${occupancy}%`} tone="cyan" />
          <Stat
            label="Open revenue"
            value={`€${revenue.toFixed(2)}`}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3 lg:grid-cols-4">
          {tables.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-zinc-900/60 p-3 transition-all",
                statusStyles[t.status],
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {t.type}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {t.name}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    statusStyles[t.status],
                  )}
                >
                  {statusLabel[t.status]}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div className="font-mono text-lg text-white tabular-nums">
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
                      <span className="text-zinc-600">--:--</span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-zinc-500">Bill</p>
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {t.status === "busy" && t.amount !== undefined
                      ? `€${t.amount.toFixed(2)}`
                      : `€${t.rate}/h`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-1">
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
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
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
    emerald: "text-emerald-300",
    cyan: "text-cyan-300",
    violet: "text-violet-300",
  }[tone];
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
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
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
    zinc: "border-white/10 bg-white/5 text-zinc-300",
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
