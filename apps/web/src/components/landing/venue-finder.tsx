"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Clock,
  Gamepad2,
  MapPin,
  Search,
  Star,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { venues } from "@/lib/mock-data";

const filters = [
  { icon: Gamepad2, label: "Billiard" },
  { icon: Gamepad2, label: "PlayStation" },
  { icon: Gamepad2, label: "Snooker" },
  { icon: Gamepad2, label: "Chess" },
];

const cities = ["Warsaw", "Kraków", "Wrocław", "Poznań"];

const liveFeed = [
  { text: "Anna just booked Cue & Cobra · 21:00", tone: "emerald" },
  { text: "Pixel Arena · 3 PS5 slots free now", tone: "cyan" },
  { text: "Tournament tonight · Black 8 Lounge", tone: "violet" },
  { text: "Knight & Pawn opens at 18:00", tone: "amber" },
] as const;

const feedTones = {
  emerald: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
  cyan: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
  violet: "border-violet-400/40 bg-violet-500/15 text-violet-100",
  amber: "border-amber-400/40 bg-amber-500/15 text-amber-100",
} as const;

export function VenueFinder() {
  const [city, setCity] = useState(0);
  const [filter, setFilter] = useState(0);
  const [feedIdx, setFeedIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setFeedIdx((i) => (i + 1) % liveFeed.length),
      3200,
    );
    return () => clearInterval(id);
  }, []);

  const feed = liveFeed[feedIdx];

  return (
    <div className="relative w-full">
      <div className="absolute -inset-x-12 -inset-y-10 -z-10 rounded-[40px] bg-gradient-to-br from-cyan-500/20 via-violet-500/10 to-emerald-500/20 blur-2xl" />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            <span className="ml-3 text-xs text-zinc-500">
              gospots.app / play
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            240 venues open now
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute right-4 top-14 z-10 hidden sm:block"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={feedIdx}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur",
                feedTones[feed.tone],
              )}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              {feed.text}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-b border-white/5 p-5">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 transition focus-within:border-cyan-400/50">
            <Search size={16} className="text-zinc-500" />
            <input
              readOnly
              value={`Tonight in ${cities[city]} · ${filters[filter].label}`}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none"
            />
            <span className="hidden items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-400 sm:inline-flex">
              <Clock size={11} /> 21:00
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {cities.map((c, i) => (
              <button
                key={c}
                onClick={() => setCity(i)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  city === i
                    ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-200",
                )}
              >
                <MapPin size={11} className="mr-1 inline" />
                {c}
              </button>
            ))}
            <span className="mx-1 self-center text-zinc-700">·</span>
            {filters.map((f, i) => (
              <button
                key={f.label}
                onClick={() => setFilter(i)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  filter === i
                    ? "border-violet-400/60 bg-violet-500/15 text-violet-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {venues.slice(0, 3).map((v, i) => (
            <motion.article
              key={v.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 transition hover:-translate-y-0.5 hover:border-white/25"
            >
              <div
                className={cn(
                  "relative h-24 overflow-hidden bg-gradient-to-br",
                  v.accent,
                )}
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_60%)]" />
                <span
                  className={cn(
                    "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur",
                    v.open
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                      : "border-zinc-500/40 bg-zinc-900/60 text-zinc-400",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      v.open ? "animate-pulse bg-emerald-400" : "bg-zinc-500",
                    )}
                  />
                  {v.open ? "Open" : "Closed"}
                </span>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">
                      {v.name}
                    </h4>
                    <p className="truncate text-[11px] text-zinc-500">
                      {v.city}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-amber-300">
                    <Star size={11} className="fill-amber-300" />
                    {v.rating}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} />
                    {v.busy}/{v.total} busy
                  </span>
                  <button className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 font-medium text-cyan-200 transition group-hover:border-cyan-400/60 group-hover:bg-cyan-500/20">
                    Reserve
                    <ArrowRight size={10} />
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  );
}
