"use client";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  BellRing,
  Check,
  Gamepad2,
  Hotel,
  Layers,
  LayoutGrid,
  Martini,
  Megaphone,
  MessagesSquare,
  Minus,
  Plus,
  Sparkles,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Magnetic } from "@/components/effects/magnetic";
import { Reveal } from "@/components/effects/reveal";
import { cn } from "@/lib/cn";
import {
  TRIAL_DURATION_DAYS,
  VENUE_ADD_ONS,
  VENUE_PACKS,
  VENUE_PACK_LIST,
  type AddOnId,
  type VenuePackId,
} from "@/lib/venue-packs";

const EASE = [0.22, 1, 0.36, 1] as const;

const PACK_ICONS: Record<VenuePackId, LucideIcon> = {
  gaming: Gamepad2,
  dining: UtensilsCrossed,
  bar: Martini,
  hotel_fb: Hotel,
  mixed: Layers,
};

const ADDON_ICONS: Record<AddOnId, LucideIcon> = {
  ops_alerts: BellRing,
  gaming_suite: Gamepad2,
  menu_orders: UtensilsCrossed,
  dining_floor: LayoutGrid,
  venue_presence: Megaphone,
  guest_chat: MessagesSquare,
  team_accounts: Users,
};

/** Flat-priced features shown as toggle cards (seats are handled separately). */
const FLAT_ADDONS = Object.values(VENUE_ADD_ONS).filter(
  (a) => !a.pricedPerSeat,
);
const SEAT_ADDON = VENUE_ADD_ONS.team_accounts;

function AnimatedPrice({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => `€${Math.round(v)}`);

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.5, ease: EASE });
    return () => controls.stop();
  }, [value, mv]);

  return <motion.span className="tabular-nums">{text}</motion.span>;
}

export function Pricing() {
  const [packId, setPackId] = useState<VenuePackId>("gaming");
  const [selected, setSelected] = useState<Set<AddOnId>>(
    () => new Set(VENUE_PACKS.gaming.recommendedFeatures),
  );
  const [seats, setSeats] = useState(0);

  const pack = VENUE_PACKS[packId];

  const total = useMemo(() => {
    let sum = 0;
    for (const id of selected) {
      const addOn = VENUE_ADD_ONS[id];
      if (!addOn.pricedPerSeat) sum += addOn.monthlyPrice;
    }
    return sum + seats * SEAT_ADDON.monthlyPrice;
  }, [selected, seats]);

  function choosePack(id: VenuePackId) {
    setPackId(id);
    // Applying the pack's suggested features keeps the calculator honest and quick.
    setSelected(new Set(VENUE_PACKS[id].recommendedFeatures));
    if (VENUE_PACKS[id].recommendedFeatures.includes("team_accounts")) {
      setSeats((s) => (s > 0 ? s : 2));
    }
  }

  function toggleFeature(id: AddOnId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setSeatCount(n: number) {
    const clamped = Math.max(0, Math.min(50, n));
    setSeats(clamped);
    setSelected((prev) => {
      const next = new Set(prev);
      if (clamped > 0) next.add("team_accounts");
      else next.delete("team_accounts");
      return next;
    });
  }

  const featureCount =
    [...selected].filter((id) => !VENUE_ADD_ONS[id].pricedPerSeat).length;

  return (
    <section id="pricing" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Pricing
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Your venue type is free.{" "}
            <span className="text-gradient">Pay only for what you run.</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            No tiers, no bundles you don&apos;t need. Pick your venue type,
            switch on the features you actually use, and watch your monthly
            price build itself — after a {TRIAL_DURATION_DAYS}-day free trial.
          </p>
        </Reveal>

        {/* Step 1 — venue type (always free) */}
        <Reveal delay={0.05} className="mt-12">
          <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
              1
            </span>
            Choose your venue type — always €0
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {VENUE_PACK_LIST.map((p) => {
              const Icon = PACK_ICONS[p.id];
              const active = packId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePack(p.id)}
                  aria-pressed={active}
                  className={cn(
                    "group relative inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium backdrop-blur transition-colors",
                    active
                      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-800 dark:text-emerald-100"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-700 hover:border-black/25 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:text-white",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="pack-glow"
                      transition={{ type: "spring", stiffness: 320, damping: 30 }}
                      className="absolute inset-0 -z-10 rounded-full bg-emerald-500/10 shadow-[0_10px_40px_-10px_rgba(52,211,153,0.5)]"
                    />
                  )}
                  <Icon
                    size={15}
                    className={
                      active
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                    }
                  />
                  {p.name}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      active
                        ? "bg-emerald-400 text-zinc-950"
                        : "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",
                    )}
                  >
                    €0
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-zinc-500">
            {pack.tagline}
          </p>
        </Reveal>

        {/* Step 2 — features */}
        <Reveal delay={0.08} className="mt-12">
          <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
              2
            </span>
            Switch on the features you need
          </div>
        </Reveal>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLAT_ADDONS.map((addOn, i) => {
            const Icon = ADDON_ICONS[addOn.id];
            const active = selected.has(addOn.id);
            const suggested = pack.recommendedFeatures.includes(addOn.id);
            return (
              <motion.button
                key={addOn.id}
                type="button"
                onClick={() => toggleFeature(addOn.id)}
                aria-pressed={active}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: EASE }}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border p-5 text-left backdrop-blur transition-all duration-300 hover:-translate-y-0.5",
                  active
                    ? "border-emerald-400/50 bg-gradient-to-b from-emerald-500/[0.1] to-transparent shadow-[0_25px_70px_-25px_rgba(52,211,153,0.55)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]/60 hover:border-black/25 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-white/25",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl transition-opacity duration-500",
                    active ? "opacity-70" : "opacity-0 group-hover:opacity-30",
                  )}
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors",
                      active
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)]/80 text-zinc-600 group-hover:text-zinc-800 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-400 dark:group-hover:text-zinc-200",
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all",
                      active
                        ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                        : "border-black/20 bg-black/5 text-transparent group-hover:border-black/40 dark:border-white/20 dark:bg-white/5 dark:group-hover:border-white/40",
                    )}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                </div>

                <div className="relative mt-4 flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-[var(--color-foreground)] dark:text-white">
                    {addOn.name}
                  </h3>
                  {suggested && !active && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      <Sparkles size={9} /> Suggested
                    </span>
                  )}
                </div>
                <p className="relative mt-1.5 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {addOn.tagline}
                </p>
                <p className="relative mt-4 text-sm">
                  <span
                    className={cn(
                      "text-xl font-bold tracking-tight",
                      active
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-[var(--color-foreground)] dark:text-white",
                    )}
                  >
                    €{addOn.monthlyPrice}
                  </span>
                  <span className="text-zinc-500"> /month</span>
                </p>
              </motion.button>
            );
          })}

          {/* Team seats — priced per seat */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.3, ease: EASE }}
            className={cn(
              "relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border p-5 backdrop-blur transition-colors sm:col-span-2 sm:flex-row sm:items-center lg:col-span-3",
              seats > 0
                ? "border-cyan-400/40 bg-gradient-to-r from-cyan-500/[0.08] to-transparent"
                : "border-[var(--color-border)] bg-[var(--color-surface)]/60 dark:border-white/10 dark:bg-white/[0.025]",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                  seats > 0
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)]/80 text-zinc-600 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-400",
                )}
              >
                <Users size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-[var(--color-foreground)] dark:text-white">
                  {SEAT_ADDON.name}
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  €{SEAT_ADDON.monthlyPrice} per employee seat / month — during
                  the trial you get 3 seats free.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setSeatCount(seats - 1)}
                aria-label="Remove a seat"
                disabled={seats === 0}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-700 transition hover:border-black/35 hover:text-zinc-900 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-white/35 dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <span className="w-16 text-center">
                <span className="block text-lg font-bold tabular-nums text-[var(--color-foreground)] dark:text-white">
                  {seats}
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  seats
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSeatCount(seats + 1)}
                aria-label="Add a seat"
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-700 transition hover:border-black/35 hover:text-zinc-900 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-white/35 dark:hover:text-white"
              >
                <Plus size={15} />
              </button>
              <span className="w-full text-right text-sm font-semibold text-cyan-700 tabular-nums sm:ml-2 sm:w-20 dark:text-cyan-300">
                €{seats * SEAT_ADDON.monthlyPrice}/mo
              </span>
            </div>
          </motion.div>
        </div>

        {/* Step 3 — live total */}
        <Reveal delay={0.1} className="mt-8">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/[0.08] via-transparent to-cyan-500/[0.06] p-6 sm:p-8">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(52,211,153,0.14),transparent_55%)]"
              aria-hidden
            />
            <div className="relative flex flex-col items-center justify-between gap-6 lg:flex-row">
              <div className="text-center lg:text-left">
                <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                  Your estimated plan
                </p>
                <div className="mt-2 flex flex-col items-center gap-0.5 sm:flex-row sm:items-baseline sm:justify-center sm:gap-2 lg:justify-start">
                  <span className="text-4xl font-bold tracking-tight text-[var(--color-foreground)] dark:text-white sm:text-5xl md:text-6xl">
                    <AnimatedPrice value={total} />
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">/month after trial</span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {pack.name} (€0) · {featureCount}{" "}
                  {featureCount === 1 ? "feature" : "features"}
                  {seats > 0 ? ` · ${seats} team ${seats === 1 ? "seat" : "seats"}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 lg:items-end">
                <Magnetic>
                  <Link
                    href="/register"
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-emerald-400 px-7 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_20px_60px_-15px_rgba(52,211,153,0.6)] transition hover:bg-emerald-300"
                  >
                    <span className="relative z-10">
                      Start {TRIAL_DURATION_DAYS} days free
                    </span>
                    <ArrowRight
                      size={16}
                      className="relative z-10 transition-transform group-hover:translate-x-1"
                    />
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  </Link>
                </Magnetic>
                <p className="text-xs text-zinc-500">
                  No card required · nothing is charged without your consent
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-zinc-500">
          Prices in EUR. Change features anytime — during the trial changes
          apply instantly; on a paid plan, removals take effect from the next
          billing month. Turning a feature off never deletes your data — it
          only hides the section until you switch it back on.
        </p>
      </div>
    </section>
  );
}
