"use client";

import {
  animate,
  LayoutGroup,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  Bell,
  Check,
  Gamepad2,
  Globe2,
  Hotel,
  Layers,
  LayoutGrid,
  MessageCircle,
  Minus,
  Plus,
  Users,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Magnetic } from "@/components/effects/magnetic";
import { Reveal } from "@/components/effects/reveal";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import {
  featuresMonthlyTotal,
  marketAdjustedCatalogEur,
  recommendedFeaturesForPack,
  SELF_SERVE_PACK_LIST,
  TRIAL_DURATION_DAYS,
  VENUE_ADD_ON_LIST,
  VENUE_ADD_ONS,
  VENUE_PACKS,
  type AddOnId,
  type SelfServePackId,
  type VenueAddOn,
} from "@/lib/venue-packs";

const EASE = [0.22, 1, 0.36, 1] as const;

const PACK_ICONS: Record<SelfServePackId, LucideIcon> = {
  gaming: Gamepad2,
  dining: UtensilsCrossed,
  bar: Wine,
  hotel_fb: Hotel,
  mixed: Layers,
};

const FEATURE_ICONS: Record<AddOnId, LucideIcon> = {
  ops_alerts: Bell,
  gaming_suite: Gamepad2,
  menu_orders: UtensilsCrossed,
  dining_floor: LayoutGrid,
  venue_presence: Globe2,
  guest_chat: MessageCircle,
  team_accounts: Users,
};

const FEATURE_ACCENT: Record<AddOnId, string> = {
  ops_alerts: "from-amber-400/20 to-transparent",
  gaming_suite: "from-cyan-400/20 to-transparent",
  menu_orders: "from-orange-400/20 to-transparent",
  dining_floor: "from-rose-400/20 to-transparent",
  venue_presence: "from-emerald-400/20 to-transparent",
  guest_chat: "from-sky-400/20 to-transparent",
  team_accounts: "from-violet-400/20 to-transparent",
};

const FEATURE_ICON_TONE: Record<AddOnId, string> = {
  ops_alerts: "text-amber-600 dark:text-amber-300",
  gaming_suite: "text-cyan-600 dark:text-cyan-300",
  menu_orders: "text-orange-600 dark:text-orange-300",
  dining_floor: "text-rose-600 dark:text-rose-300",
  venue_presence: "text-emerald-600 dark:text-emerald-300",
  guest_chat: "text-sky-600 dark:text-sky-300",
  team_accounts: "text-violet-600 dark:text-violet-300",
};

const SEAT_ADDON = VENUE_ADD_ONS.team_accounts;

function AnimatedPrice({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.5, ease: EASE });
    return () => controls.stop();
  }, [value, mv]);

  return <motion.span className="tabular-nums">{text}</motion.span>;
}

export function Pricing() {
  const { t, formatMoney, convertAmount, currency, locale } = usePublicPrefs();
  const [packId, setPackId] = useState<SelfServePackId>("gaming");
  const [features, setFeatures] = useState<AddOnId[]>(() =>
    recommendedFeaturesForPack("gaming"),
  );
  const [seats, setSeats] = useState(0);

  const pack = VENUE_PACKS[packId];
  const freePrice = formatMoney(0);
  const hasTeam = features.includes("team_accounts");
  const effectiveSeats = hasTeam ? Math.max(0, seats) : 0;
  const totalEur = marketAdjustedCatalogEur(
    featuresMonthlyTotal(features, effectiveSeats),
    currency,
  );
  const displayTotal = convertAmount(totalEur, "EUR");
  const selectedCount = featureCountSafe(features);

  const formatDisplay = useMemo(() => {
    return (n: number) => {
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(n);
      } catch {
        return `${n} ${currency}`;
      }
    };
  }, [locale, currency]);

  const sortedFeatures = useMemo(() => {
    return [...VENUE_ADD_ON_LIST].sort((a, b) => {
      const as = a.recommendedFor?.includes(packId) ? 0 : 1;
      const bs = b.recommendedFor?.includes(packId) ? 0 : 1;
      if (as !== bs) return as - bs;
      return 0;
    });
  }, [packId]);

  function choosePack(id: SelfServePackId) {
    setPackId(id);
    const next = recommendedFeaturesForPack(id);
    setFeatures(next);
    if (!next.includes("team_accounts")) setSeats(0);
  }

  function toggleFeature(id: AddOnId) {
    setFeatures((prev) => {
      if (prev.includes(id)) {
        if (id === "team_accounts") setSeats(0);
        return prev.filter((x) => x !== id);
      }
      if (id === "team_accounts" && seats < 1) setSeats(1);
      return [...prev, id];
    });
  }

  function setSeatCount(n: number) {
    const next = Math.max(0, Math.min(50, n));
    setSeats(next);
    setFeatures((prev) => {
      const has = prev.includes("team_accounts");
      if (next > 0 && !has) return [...prev, "team_accounts"];
      if (next === 0 && has) return prev.filter((x) => x !== "team_accounts");
      return prev;
    });
  }

  const seatLabel =
    effectiveSeats === 1 ? t("pricing.seat") : t("pricing.seatsWord");
  const seatsPart =
    effectiveSeats > 0
      ? t("pricing.teamPart", { count: effectiveSeats, seatLabel })
      : "";

  const selectedList = VENUE_ADD_ON_LIST.filter((f) =>
    features.includes(f.id as AddOnId),
  );

  return (
    <section id="pricing" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            {t("pricing.eyebrow")}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            {t("pricing.title")}{" "}
            <span className="text-gradient">{t("pricing.titleAccent")}</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            {t("pricing.subtitle", { days: TRIAL_DURATION_DAYS })}
          </p>
        </Reveal>

        <div className="mt-14 overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-zinc-950/40 sm:p-6 lg:p-8">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:gap-10">
            <div className="min-w-0 space-y-9">
              <Reveal delay={0.04}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {t("pricing.step1", { price: freePrice })}
                    </p>
                    <p className="mt-1.5 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                      {t(`pack.${pack.id}.tagline`)}
                    </p>
                  </div>
                </div>

                <LayoutGroup>
                  <div
                    role="radiogroup"
                    aria-label={t("pricing.step1", { price: freePrice })}
                    className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
                  >
                    {SELF_SERVE_PACK_LIST.map((p) => {
                      const Icon = PACK_ICONS[p.id as SelfServePackId];
                      const active = packId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => choosePack(p.id as SelfServePackId)}
                          className={cn(
                            "relative flex min-w-[8.5rem] flex-1 flex-col items-start gap-2.5 rounded-2xl px-3.5 py-3.5 text-left transition sm:min-w-0",
                            active
                              ? "bg-white text-zinc-950 shadow-[0_16px_40px_-24px_rgba(16,185,129,0.45)] ring-1 ring-emerald-500/45 dark:bg-zinc-900 dark:text-white dark:shadow-[0_16px_40px_-24px_rgba(16,185,129,0.55)] dark:ring-emerald-400/50"
                              : "bg-zinc-100/90 text-zinc-700 ring-1 ring-transparent hover:bg-zinc-200/80 dark:bg-white/[0.035] dark:text-zinc-300 dark:hover:bg-white/[0.06]",
                          )}
                        >
                          {active ? (
                            <motion.span
                              layoutId="pack-active-bar"
                              className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
                              transition={{
                                type: "spring",
                                stiffness: 380,
                                damping: 32,
                              }}
                            />
                          ) : null}
                          <span
                            className={cn(
                              "grid h-9 w-9 place-items-center rounded-xl",
                              active
                                ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                                : "bg-black/[0.04] text-zinc-500 dark:bg-white/[0.06]",
                            )}
                          >
                            <Icon size={17} />
                          </span>
                          <span className="text-[13px] font-semibold leading-snug">
                            {t(`pack.${p.id}.name`)}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-[10px] tracking-wide",
                              active
                                ? "text-zinc-500 dark:text-zinc-400"
                                : "text-zinc-500",
                            )}
                          >
                            {freePrice}
                          </span>
                          {active ? (
                            <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white dark:bg-emerald-400 dark:text-zinc-950">
                              <Check size={11} strokeWidth={3} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </Reveal>

              <Reveal delay={0.08}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {t("pricing.step2")}
                    </p>
                    <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {t("pricing.featuresHint", { count: selectedCount })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFeatures(recommendedFeaturesForPack(packId));
                      setSeats(0);
                    }}
                    className="text-xs font-medium text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    {t("pricing.useSuggested")}
                  </button>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {sortedFeatures.map((feature, i) => (
                    <FeatureTile
                      key={feature.id}
                      feature={feature}
                      on={features.includes(feature.id as AddOnId)}
                      suggested={Boolean(
                        feature.recommendedFor?.includes(packId),
                      )}
                      index={i}
                      formatMoney={(n) =>
                        formatMoney(marketAdjustedCatalogEur(n, currency), "EUR")
                      }
                      t={t}
                      onToggle={() => toggleFeature(feature.id as AddOnId)}
                      isTeam={feature.id === "team_accounts"}
                      seats={effectiveSeats}
                      onSeatsChange={setSeatCount}
                    />
                  ))}
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.1} className="lg:sticky lg:top-24">
              <div className="relative overflow-hidden rounded-[1.6rem] border border-emerald-500/20 bg-white text-zinc-950 shadow-[0_30px_80px_-40px_rgba(16,185,129,0.35)] dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.14),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(52,211,153,0.22),transparent_70%)]"
                  aria-hidden
                />

                <div className="relative border-b border-zinc-200/80 px-6 py-5 dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300/90">
                    {t("pricing.estimate")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
                    <span className="text-5xl font-bold tracking-tight">
                      <AnimatedPrice
                        key={`${currency}-${locale}`}
                        value={displayTotal}
                        format={formatDisplay}
                      />
                    </span>
                    <span className="mb-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                      {t("pricing.afterTrial")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {t("pricing.summary", {
                      pack: t(`pack.${pack.id}.name`),
                      price: freePrice,
                      features: selectedCount,
                      featureLabel:
                        selectedCount === 1
                          ? t("pricing.feature")
                          : t("pricing.features"),
                      seatsPart,
                    })}
                  </p>
                </div>

                <ul className="relative max-h-56 space-y-0 overflow-y-auto px-3 py-2">
                  <li className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5 text-zinc-700 dark:text-zinc-300">
                      {(() => {
                        const PackIcon = PACK_ICONS[packId];
                        return (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:bg-white/5 dark:text-emerald-300">
                            <PackIcon size={14} />
                          </span>
                        );
                      })()}
                      <span className="truncate">{t(`pack.${pack.id}.name`)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-500">
                      {freePrice}
                    </span>
                  </li>
                  {selectedList.length === 0 ? (
                    <li className="px-3 py-3 text-sm text-zinc-500">
                      {t("pricing.noneSelected")}
                    </li>
                  ) : (
                    selectedList.map((f) => {
                      const id = f.id as AddOnId;
                      const Icon = FEATURE_ICONS[id];
                      const line =
                        id === "team_accounts"
                          ? `${formatMoney(marketAdjustedCatalogEur(effectiveSeats * f.monthlyPrice, currency), "EUR")}${t("pricing.perMonthShort")}`
                          : `${formatMoney(marketAdjustedCatalogEur(f.monthlyPrice, currency), "EUR")}${t("pricing.perMonthShort")}`;
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-zinc-100/80 dark:hover:bg-white/[0.03]"
                        >
                          <span className="flex min-w-0 items-center gap-2.5 text-zinc-700 dark:text-zinc-300">
                            <span
                              className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-100 dark:bg-white/5",
                                FEATURE_ICON_TONE[id],
                              )}
                            >
                              <Icon size={14} />
                            </span>
                            <span className="truncate">
                              {t(`addon.${id}.name`)}
                            </span>
                            {id === "team_accounts" && effectiveSeats > 0 ? (
                              <span className="shrink-0 text-xs text-zinc-500">
                                ×{effectiveSeats}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            {line}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="relative border-t border-zinc-200/80 px-6 py-5 dark:border-white/10">
                  <p className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-medium text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200/90">
                    {t("pricing.trialBanner", { days: TRIAL_DURATION_DAYS })}
                  </p>
                  <Magnetic className="flex w-full">
                    <Link
                      href="/register"
                      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                    >
                      <span className="relative z-10">
                        {t("pricing.startTrial", { days: TRIAL_DURATION_DAYS })}
                      </span>
                      <ArrowRight
                        size={16}
                        className="relative z-10 transition-transform group-hover:translate-x-1"
                      />
                    </Link>
                  </Magnetic>
                  <p className="mt-3 text-center text-xs text-zinc-500">
                    {t("pricing.noCard")}
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-zinc-500">
          {t("pricing.footnote", { currency })}
        </p>
      </div>
    </section>
  );
}

function featureCountSafe(features: AddOnId[]) {
  return features.filter((id) => id !== "team_accounts").length +
    (features.includes("team_accounts") ? 1 : 0);
}

function FeatureTile({
  feature,
  on,
  suggested,
  index,
  formatMoney,
  t,
  onToggle,
  isTeam,
  seats,
  onSeatsChange,
}: {
  feature: VenueAddOn;
  on: boolean;
  suggested: boolean;
  index: number;
  formatMoney: (n: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onToggle: () => void;
  isTeam: boolean;
  seats: number;
  onSeatsChange: (n: number) => void;
}) {
  const id = feature.id as AddOnId;
  const Icon = FEATURE_ICONS[id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.32, delay: index * 0.025, ease: EASE }}
      className={cn(
        "group relative overflow-hidden rounded-2xl transition duration-200",
        on
          ? "bg-emerald-500/[0.08] ring-1 ring-emerald-400/40"
          : "bg-zinc-100/80 ring-1 ring-black/[0.04] hover:bg-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.05] dark:hover:bg-white/[0.05]",
        isTeam && on ? "sm:col-span-2" : "",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b transition",
          on ? "from-emerald-400 to-emerald-500/40 opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition duration-300",
          FEATURE_ACCENT[id],
          on ? "opacity-100" : "group-hover:opacity-60",
        )}
        aria-hidden
      />

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="relative flex w-full items-start gap-3.5 p-4 text-left sm:gap-4 sm:p-5"
      >
        <span
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition",
            on
              ? "bg-emerald-400 text-zinc-950 shadow-[0_8px_24px_-10px_rgba(52,211,153,0.8)]"
              : cn(
                  "bg-black/[0.04] dark:bg-white/[0.06]",
                  FEATURE_ICON_TONE[id],
                ),
          )}
        >
          <Icon size={18} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-semibold leading-snug text-[var(--color-foreground)] dark:text-white">
              {t(`addon.${id}.name`)}
            </span>
            {suggested ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300/90">
                <span className="h-1 w-1 rounded-full bg-amber-400" />
                {t("pricing.suggested")}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-[13px]">
            {t(`addon.${id}.tagline`)}
          </span>
          <span
            className={cn(
              "mt-2.5 inline-block font-mono text-sm font-semibold tabular-nums",
              on
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-[var(--color-foreground)] dark:text-zinc-200",
            )}
          >
            {formatMoney(feature.monthlyPrice)}
            <span className="ml-0.5 text-[11px] font-normal text-zinc-500">
              {feature.pricedPerSeat
                ? t("pricing.perSeat")
                : t("pricing.perMonthShort")}
            </span>
          </span>
        </span>

        <span
          className={cn(
            "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
            on
              ? "border-emerald-400 bg-emerald-400 text-zinc-950"
              : "border-zinc-300/80 dark:border-white/20",
          )}
        >
          {on ? <Check size={12} strokeWidth={3} /> : null}
        </span>
      </button>

      {isTeam && on ? (
        <div className="relative flex flex-col gap-3 border-t border-emerald-400/15 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {t("pricing.seatHint", {
              price: formatMoney(SEAT_ADDON.monthlyPrice),
            })}
          </p>
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => onSeatsChange(seats - 1)}
              aria-label="Remove a seat"
              disabled={seats === 0}
              className="grid h-8 w-8 place-items-center rounded-lg bg-black/[0.05] text-zinc-700 transition hover:bg-black/10 disabled:opacity-30 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[3.25rem] text-center">
              <span className="block text-base font-bold tabular-nums text-[var(--color-foreground)] dark:text-white">
                {seats}
              </span>
              <span className="block text-[9px] uppercase tracking-wider text-zinc-500">
                {t("pricing.seats")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onSeatsChange(seats + 1)}
              aria-label="Add a seat"
              className="grid h-8 w-8 place-items-center rounded-lg bg-black/[0.05] text-zinc-700 transition hover:bg-black/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
            >
              <Plus size={14} />
            </button>
            <span className="ml-1 font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoney(seats * SEAT_ADDON.monthlyPrice)}
              <span className="text-[11px] font-normal text-zinc-500">
                {t("pricing.perMonthShort")}
              </span>
            </span>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
