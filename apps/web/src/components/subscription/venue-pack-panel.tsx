"use client";

import { Check, Info, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  updateVenuePack,
  type SubscriptionResponse,
} from "@/lib/dashboard-client";
import { TRIAL_STAFF_SEAT_LIMIT } from "@/lib/plan";
import {
  featuresMonthlyTotal,
  serializeAddOns,
  VENUE_ADD_ONS,
  type AddOnId,
  type VenuePackId,
} from "@/lib/venue-packs";
import { useVenueSettings } from "@/lib/venue-settings-context";

function FeatureInfoTip({
  details,
  ariaLabel,
}: {
  details: string;
  ariaLabel: string;
}) {
  return (
    <span
      className="group/info relative inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="note"
      aria-label={ariaLabel}
    >
      <Info
        size={14}
        className="text-zinc-500 transition group-hover/info:text-emerald-300"
      />
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-left text-[11px] leading-relaxed text-zinc-300 shadow-xl",
          "opacity-0 transition-opacity duration-150 group-hover/info:opacity-100",
        )}
      >
        {details}
      </span>
    </span>
  );
}

function parseFeatureList(csv: string | null | undefined): AddOnId[] {
  return (csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AddOnId[];
}

export function VenuePackPanel({
  data,
  onUpdated,
}: {
  data: SubscriptionResponse;
  onUpdated: (next: SubscriptionResponse) => void;
}) {
  const { formatFromEur, t } = useVenueSettings();
  const trialActive = data.trialActive;
  const paidActive =
    data.subscription?.status === "ACTIVE" && !data.trialActive;
  const trialSeatMax = data.trialStaffSeatLimit ?? TRIAL_STAFF_SEAT_LIMIT;

  const editorSource = useMemo(() => {
    if (data.hasPendingChanges && data.pendingPackId) {
      return {
        packId: data.pendingPackId as VenuePackId,
        addOns: data.pendingAddOns ?? "",
        seats: data.pendingStaffSeatQuantity ?? 0,
      };
    }
    return {
      packId: (data.packId as VenuePackId) || "gaming",
      addOns: data.addOns || "",
      seats: data.staffSeatQuantity ?? 0,
    };
  }, [data]);

  const awaitingPayment = Boolean(
    data.trialExpired ||
      data.subscription?.status === "CANCELED" ||
      data.subscription?.status === "PAST_DUE",
  );

  const savedFeatures = useMemo(
    () => parseFeatureList(editorSource.addOns),
    [editorSource.addOns],
  );

  const [packId, setPackId] = useState<VenuePackId>(editorSource.packId);
  const [features, setFeatures] = useState<AddOnId[]>(() => savedFeatures);
  const [seatQty, setSeatQty] = useState(
    editorSource.seats || (trialActive ? trialSeatMax : 0),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPackId(editorSource.packId);
    const next = parseFeatureList(editorSource.addOns);
    setFeatures(next);
    setSeatQty(
      editorSource.seats ||
        (trialActive && next.includes("team_accounts") ? trialSeatMax : 0),
    );
  }, [editorSource, trialActive, trialSeatMax]);

  const hasTeam = features.includes("team_accounts");
  const maxSeats = trialActive ? trialSeatMax : 100;
  const effectiveSeats = hasTeam
    ? Math.min(maxSeats, Math.max(trialActive ? 1 : 0, seatQty))
    : 0;
  const total = useMemo(
    () => featuresMonthlyTotal(features, effectiveSeats),
    [features, effectiveSeats],
  );

  const dirty =
    packId !== editorSource.packId ||
    serializeAddOns(features) !== (editorSource.addOns || "") ||
    effectiveSeats !== (editorSource.seats ?? 0);

  const neverConfigured = !data.addOns?.trim() && !data.hasPendingChanges;

  const catalog = useMemo(() => {
    if (data.addOnCatalog?.length) return data.addOnCatalog;
    return Object.values(VENUE_ADD_ONS);
  }, [data.addOnCatalog]);

  async function save() {
    if (hasTeam && effectiveSeats < 1) {
      setError(
        trialActive
          ? t("subscription.seatErrorTrial", { max: trialSeatMax })
          : t("subscription.seatErrorPaid"),
      );
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateVenuePack({
        packId,
        addOns: features,
        staffSeatQuantity: effectiveSeats,
      });
      onUpdated(next);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("subscription.saveError"),
      );
    } finally {
      setSaving(false);
    }
  }

  const pendingWhen = data.pendingAppliesAt
    ? t("subscription.pendingOn", {
        date: new Date(data.pendingAppliesAt).toLocaleDateString(),
      })
    : t("subscription.pendingPeriodEnd");
  const pendingThenPrice =
    data.pendingMonthlyTotal != null
      ? t("subscription.pendingThen", {
          price: formatFromEur(data.pendingMonthlyTotal),
        })
      : "";
  const checkoutPricePart =
    data.pendingMonthlyTotal != null
      ? t("subscription.checkoutPricePart", {
          price: formatFromEur(data.pendingMonthlyTotal),
        })
      : "";

  return (
    <div className="space-y-6">
      {awaitingPayment ? (
        <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <p className="font-medium">{t("subscription.payToUnlockTitle")}</p>
          <p className="mt-1 text-xs text-sky-200/80">
            {t("subscription.payToUnlockBody")}
          </p>
        </div>
      ) : null}

      {data.hasPendingChanges && paidActive ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">{t("subscription.pendingTitle")}</p>
          <p className="mt-1 text-xs text-amber-200/80">
            {t("subscription.pendingBody", {
              when: pendingWhen,
              thenPrice: pendingThenPrice,
            })}
          </p>
        </div>
      ) : null}

      {data.hasPendingChanges && awaitingPayment ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">{t("subscription.checkoutReadyTitle")}</p>
          <p className="mt-1 text-xs text-amber-200/80">
            {t("subscription.checkoutReadyBody", {
              pricePart: checkoutPricePart,
            })}
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-white">
          {t("subscription.venueType")}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {trialActive
            ? t("subscription.venueTypeHintTrial")
            : paidActive
              ? t("subscription.venueTypeHintPaid")
              : t("subscription.venueTypeHintDefault")}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.packs.map((pack) => {
            const active = pack.id === packId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => {
                  setPackId(pack.id as VenuePackId);
                  setSaved(false);
                }}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition",
                  active
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 hover:bg-white/[0.03]",
                )}
              >
                <span className="font-medium text-white">
                  {t(`pack.${pack.id}.name`)}
                </span>
                <p className="mt-1 text-xs text-zinc-500">
                  {t(`pack.${pack.id}.tagline`)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {t("subscription.featuresNeeded")}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {trialActive
                ? t("subscription.featuresHintTrial")
                : paidActive
                  ? t("subscription.featuresHintPaid")
                  : t("subscription.featuresHintDefault")}
            </p>
          </div>
          <p className="text-right">
            <span className="text-2xl font-semibold text-emerald-300">
              {formatFromEur(total)}
            </span>
            <span className="text-sm text-zinc-500">{t("subscription.perMo")}</span>
          </p>
        </div>

        {neverConfigured ? (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {t("subscription.suggestedBanner")}
          </p>
        ) : null}

        {data.dataRetentionNote ? (
          <p className="mt-3 text-[11px] text-zinc-500">{data.dataRetentionNote}</p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {catalog.map((feature) => {
            const id = feature.id as AddOnId;
            const on = features.includes(id);
            const catalogDetails = t(`addon.${id}.details`);
            const recommended =
              "recommendedFor" in feature &&
              Array.isArray(feature.recommendedFor) &&
              feature.recommendedFor.includes(packId);
            return (
              <li key={feature.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFeatures((prev) => {
                      if (on) {
                        if (id === "team_accounts") setSeatQty(0);
                        return prev.filter((x) => x !== id);
                      }
                      if (id === "team_accounts" && seatQty < 1) {
                        setSeatQty(trialActive ? trialSeatMax : 1);
                      }
                      return [...prev, id];
                    });
                    setSaved(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
                    on
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-white/10 hover:bg-white/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-5 w-5 place-items-center rounded border",
                      on
                        ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                        : "border-white/20",
                    )}
                  >
                    {on ? <Check size={12} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">
                          {t(`addon.${id}.name`)}
                        </span>
                        <FeatureInfoTip
                          details={catalogDetails}
                          ariaLabel={t("subscription.featureDetails")}
                        />
                        {recommended ? (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                            {t("subscription.suggested")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-emerald-300">
                        {formatFromEur(feature.monthlyPrice)}
                        <span className="text-xs text-zinc-500">
                          {VENUE_ADD_ONS[id]?.pricedPerSeat ||
                          feature.pricedPerSeat
                            ? t("subscription.perSeat")
                            : t("subscription.perMo")}
                        </span>
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {t(`addon.${id}.tagline`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {hasTeam ? (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
            <label className="block text-sm font-medium text-white">
              {t("subscription.employeeSeats")}
            </label>
            <p className="mt-1 text-xs text-zinc-500">
              {trialActive
                ? t("subscription.seatsHintTrial", {
                    max: trialSeatMax,
                    price: formatFromEur(
                      VENUE_ADD_ONS.team_accounts.monthlyPrice,
                    ),
                  })
                : t("subscription.seatsHintPaid", {
                    price: formatFromEur(
                      VENUE_ADD_ONS.team_accounts.monthlyPrice,
                    ),
                  })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSeatQty((n) => Math.max(1, n - 1));
                  setSaved(false);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white hover:bg-white/5"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={maxSeats}
                value={Math.min(maxSeats, seatQty || 1)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setSeatQty(
                    Number.isFinite(n)
                      ? Math.max(1, Math.min(maxSeats, n))
                      : 1,
                  );
                  setSaved(false);
                }}
                className="w-20 rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-center text-sm text-white"
              />
              <button
                type="button"
                onClick={() => {
                  setSeatQty((n) =>
                    Math.min(maxSeats, Math.max(1, n) + 1),
                  );
                  setSaved(false);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white hover:bg-white/5"
              >
                +
              </button>
              {!trialActive ? (
                <span className="text-sm text-emerald-300">
                  ={" "}
                  {formatFromEur(
                    VENUE_ADD_ONS.team_accounts.monthlyPrice *
                      Math.max(1, seatQty),
                  )}
                  {t("subscription.perMo")}
                </span>
              ) : (
                <span className="text-sm text-emerald-300">
                  {t("subscription.trialSeats", {
                    used: Math.min(maxSeats, seatQty || 1),
                    max: trialSeatMax,
                  })}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-emerald-300">
          {paidActive
            ? t("subscription.savedScheduled")
            : t("subscription.savedOk")}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!dirty || saving || features.length === 0}
        onClick={() => void save()}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : null}
        {paidActive
          ? t("subscription.scheduleNext")
          : t("subscription.saveFeatures")}
      </button>
      {features.length === 0 ? (
        <p className="text-xs text-zinc-500">{t("subscription.selectOne")}</p>
      ) : null}
    </div>
  );
}
