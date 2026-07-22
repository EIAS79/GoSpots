"use client";

import { ChevronDown, Clock, Gamepad2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  listBowlingModes,
  type BowlingModeDefinition,
} from "@/lib/bowling-modes";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type { PublicGamingOffering } from "@/lib/shop-settings-client";
import { coerceMoney, type MoneyWire } from "@/lib/money";

function chargeTypeMeta(
  type: BowlingModeDefinition["chargeType"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (type) {
    case "PERSON":
      return {
        label: t("pricing.perPerson"),
        icon: Users,
        blurb: t("pricing.personBlurb"),
      };
    case "GAME":
      return {
        label: t("pricing.perGame"),
        icon: Gamepad2,
        blurb: t("pricing.gameBlurb"),
      };
    default:
      return {
        label: t("pricing.byTime"),
        icon: Clock,
        blurb: t("pricing.timeBlurb"),
      };
  }
}

function modeSummaryLine(
  mode: BowlingModeDefinition,
  formatPrice: (n: import("@/lib/money").MoneyWire) => string,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (mode.chargeType === "PERSON" && mode.pricePerPerson != null) {
    return t("pricing.personMin", {
      price: formatPrice(mode.pricePerPerson),
      slashPerson: t("pricing.slashPerson"),
      minutes: mode.slotMinutes,
      min: t("pricing.min"),
    });
  }
  if (mode.chargeType === "GAME" && mode.pricePerGame != null) {
    return `${formatPrice(mode.pricePerGame)} ${t("pricing.slashGame")}`;
  }
  if (mode.chargeType === "TIME" && mode.rates[0]) {
    return t("pricing.fromLine", {
      price: formatPrice(mode.rates[0].price),
      label: mode.rates[0].label,
    });
  }
  return chargeTypeMeta(mode.chargeType, t).label;
}

export function OfferingPricingPanel({
  offering,
  currency,
}: {
  offering: PublicGamingOffering;
  currency: string;
  locale?: string;
}) {
  const { formatMoney, t } = usePublicPrefs();
  const formatPrice = (n: import("@/lib/money").MoneyWire) => formatMoney(n, currency);

  if (offering.type === "BOWLING") {
    return (
      <BowlingPricingDropdown offering={offering} formatPrice={formatPrice} />
    );
  }

  if (offering.rates.length === 0) return null;

  return (
    <RatesPricingDropdown
      rates={offering.rates}
      formatPrice={formatPrice}
      unitHint={
        offering.type === "PC" || offering.type === "PLAYSTATION"
          ? t("pricing.station")
          : t("pricing.table")
      }
    />
  );
}

function RatesPricingDropdown({
  rates,
  formatPrice,
  unitHint,
}: {
  rates: PublicGamingOffering["rates"];
  formatPrice: (n: MoneyWire) => string;
  unitHint: string;
}) {
  const { t } = usePublicPrefs();
  const [open, setOpen] = useState(true);
  const fromPrice = rates.reduce(
    (min, r) => {
      const p = coerceMoney(r.price);
      return p < min ? p : min;
    },
    coerceMoney(rates[0]?.price ?? 0),
  );

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
            {t("pricing.pricing")}
          </p>
          <p className="mt-0.5 text-sm font-medium text-amber-50">
            {t("pricing.from", { price: formatPrice(fromPrice) })}
            <span className="ml-1.5 font-normal text-zinc-500">
              ·{" "}
              {t(rates.length === 1 ? "pricing.rateOne" : "pricing.ratesCount", {
                count: rates.length,
              })}
            </span>
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-amber-200/70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-amber-500/15 px-3.5 pb-3.5 pt-3">
          <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-500">
            {t("pricing.ratesHint", { unit: unitHint })}
          </p>
          <ul className="space-y-1.5">
            {rates.map((rate, i) => (
              <li
                key={`${rate.label}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{rate.label}</p>
                  {rate.durationMinutes != null ? (
                    <p className="text-[10px] text-zinc-500">
                      {t("pricing.minutes", { count: rate.durationMinutes })}
                    </p>
                  ) : (
                    <p className="text-[10px] text-zinc-500">
                      {t("pricing.flatOpen")}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-100">
                  {formatPrice(rate.price)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BowlingPricingDropdown({
  offering,
  formatPrice,
}: {
  offering: PublicGamingOffering;
  formatPrice: (n: import("@/lib/money").MoneyWire) => string;
}) {
  const { t } = usePublicPrefs();
  const modes = useMemo(
    () =>
      listBowlingModes(
        offering.offeringConfig,
        offering.bookingMode,
        offering.rates,
        offering.slotMinutes,
      ),
    [
      offering.offeringConfig,
      offering.bookingMode,
      offering.rates,
      offering.slotMinutes,
    ],
  );

  const [selectedId, setSelectedId] = useState(modes[0]?.id ?? "");
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => {
    setSelectedId((prev) =>
      modes.some((m) => m.id === prev) ? prev : (modes[0]?.id ?? ""),
    );
  }, [modes]);

  const selected =
    modes.find((m) => m.id === selectedId) ?? modes[0] ?? null;

  if (!modes.length || !selected) return null;

  const meta = chargeTypeMeta(selected.chargeType, t);
  const MetaIcon = meta.icon;

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
          {t("pricing.bowlingTitle")}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          {t("pricing.bowlingBody", {
            modes: t(
              modes.length === 1
                ? "pricing.bookingModeOne"
                : "pricing.bookingModes",
              { count: modes.length },
            ),
          })}
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {(["TIME", "PERSON", "GAME"] as const).map((charge) => {
            const available = modes.some((m) => m.chargeType === charge);
            const m = chargeTypeMeta(charge, t);
            return (
              <li
                key={charge}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-medium",
                  available
                    ? "border-violet-400/35 bg-violet-500/15 text-violet-100"
                    : "border-white/5 bg-white/[0.02] text-zinc-600 line-through",
                )}
              >
                {m.label}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
        <div className="px-3.5 pt-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
            {t("pricing.bookingMode")}
            <div className="relative mt-1.5">
              <select
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 pr-9 text-sm font-medium text-[var(--color-foreground)] outline-none focus:border-amber-400/40"
              >
                {modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
            </div>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          className="mt-2 flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
          aria-expanded={listOpen}
        >
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/60 text-amber-700 dark:text-amber-200">
              <MetaIcon size={14} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-amber-50">
                {selected.name}
              </p>
              <p className="text-[11px] text-zinc-500">{meta.label}</p>
            </div>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-amber-200/70 transition-transform",
              listOpen && "rotate-180",
            )}
          />
        </button>

        {listOpen ? (
          <div className="border-t border-amber-500/15 px-3.5 pb-3.5 pt-3">
            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              {meta.blurb}
            </p>

            <ul className="space-y-1.5">
              {selected.chargeType === "PERSON" ? (
                <>
                  <PriceRow
                    label={t("pricing.pricePerPerson")}
                    value={
                      selected.pricePerPerson != null
                        ? formatPrice(selected.pricePerPerson)
                        : t("pricing.setAtVenue")
                    }
                  />
                  <PriceRow
                    label={t("pricing.slotLength")}
                    value={`${selected.slotMinutes} ${t("pricing.min")}`}
                  />
                  <PriceRow
                    label={t("pricing.playersAllowed")}
                    value={`${selected.minPlayers}–${selected.maxPlayers}`}
                  />
                </>
              ) : null}

              {selected.chargeType === "GAME" ? (
                <>
                  <PriceRow
                    label={t("pricing.pricePerGame")}
                    value={
                      selected.pricePerGame != null
                        ? formatPrice(selected.pricePerGame)
                        : t("pricing.setAtVenue")
                    }
                  />
                  <PriceRow
                    label={t("pricing.defaultGames")}
                    value={String(selected.defaultGames)}
                  />
                  {selected.minutesPerGame != null ? (
                    <PriceRow
                      label={t("pricing.minutesPerGame")}
                      value={`${selected.minutesPerGame} ${t("pricing.min")}`}
                    />
                  ) : null}
                </>
              ) : null}

              {selected.chargeType === "TIME" ? (
                selected.rates.length > 0 ? (
                  selected.rates.map((rate, i) => (
                    <li
                      key={`${rate.label}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-200">
                          {rate.label}
                        </p>
                        {rate.durationMinutes != null ? (
                          <p className="text-[10px] text-zinc-500">
                            {t("pricing.minutes", {
                              count: rate.durationMinutes,
                            })}
                          </p>
                        ) : (
                          <p className="text-[10px] text-zinc-500">
                            {t("pricing.customDuration")}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-100">
                        {formatPrice(rate.price)}
                      </p>
                    </li>
                  ))
                ) : (
                  <PriceRow
                    label={t("pricing.timedRates")}
                    value={t("pricing.configuredAtVenue")}
                  />
                )
              ) : null}
            </ul>

            {modes.length > 1 ? (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/40 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {t("pricing.allModes")}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {modes.map((mode) => (
                    <li
                      key={mode.id}
                      className={cn(
                        "flex items-center justify-between gap-2 text-[11px]",
                        mode.id === selected.id
                          ? "text-amber-800 dark:text-amber-100"
                          : "text-zinc-600 dark:text-zinc-400",
                      )}
                    >
                      <span className="truncate">{mode.name}</span>
                      <span className="shrink-0 tabular-nums text-zinc-500">
                        {modeSummaryLine(mode, formatPrice, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-3 text-[10px] text-zinc-600">
              {t("pricing.chooseMode")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 py-2">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-100">
        {value}
      </span>
    </li>
  );
}
