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
  recommendedFeaturesForPack,
  serializeAddOns,
  VENUE_ADD_ONS,
  type AddOnId,
  type VenuePackId,
} from "@/lib/venue-packs";

function FeatureInfoTip({ details }: { details: string }) {
  return (
    <span
      className="group/info relative inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="note"
      aria-label="Feature details"
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
  const [features, setFeatures] = useState<AddOnId[]>(() =>
    savedFeatures.length
      ? savedFeatures
      : recommendedFeaturesForPack(editorSource.packId),
  );
  const [seatQty, setSeatQty] = useState(
    editorSource.seats || (trialActive ? trialSeatMax : 0),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPackId(editorSource.packId);
    const next = parseFeatureList(editorSource.addOns);
    setFeatures(
      next.length ? next : recommendedFeaturesForPack(editorSource.packId),
    );
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
          ? `Set 1–${trialSeatMax} employee seats, or turn off Team accounts.`
          : "Set how many employee seats to buy (at least 1), or turn off Team accounts.",
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
      setError(e instanceof Error ? e.message : "Could not save features.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {awaitingPayment ? (
        <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <p className="font-medium">Pay to unlock modules</p>
          <p className="mt-1 text-xs text-sky-200/80">
            Your feature picks are saved for checkout. Sidebar sections stay
            hidden until payment succeeds and the subscription is active again.
          </p>
        </div>
      ) : null}

      {data.hasPendingChanges && paidActive ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">Changes scheduled for next billing month</p>
          <p className="mt-1 text-xs text-amber-200/80">
            You already paid this period — no mid-cycle refunds or cuts. New
            features / seats apply
            {data.pendingAppliesAt
              ? ` on ${new Date(data.pendingAppliesAt).toLocaleDateString()}`
              : " at period end"}
            {data.pendingMonthlyTotal != null
              ? ` · then €${data.pendingMonthlyTotal}/mo`
              : ""}
            . Current access stays until then. Your data is never deleted.
          </p>
        </div>
      ) : null}

      {data.hasPendingChanges && awaitingPayment ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">Features ready for checkout</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Saved selection
            {data.pendingMonthlyTotal != null
              ? ` · €${data.pendingMonthlyTotal}/mo`
              : ""}
            . Complete payment to unlock these modules in the dashboard.
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-white">Venue type</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Free. Guides suggestions
          {trialActive
            ? " — and with features below, updates dashboard visibility when you save."
            : paidActive
              ? " — type/feature edits on a paid plan take effect next month."
              : "."}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.packs.map((pack) => {
            const active = pack.id === packId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => {
                  const next = pack.id as VenuePackId;
                  setPackId(next);
                  if (neverConfigured) {
                    setFeatures(recommendedFeaturesForPack(next));
                  }
                  setSaved(false);
                }}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition",
                  active
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 hover:bg-white/[0.03]",
                )}
              >
                <span className="font-medium text-white">{pack.name}</span>
                <p className="mt-1 text-xs text-zinc-500">{pack.tagline}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Features you need
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {trialActive
                ? "Add or remove anytime during trial. Save to refresh sidebar visibility — data is kept even when a feature is off."
                : paidActive
                  ? "Edits schedule for the next billing month. No refunds mid-cycle; data stays if you turn something off."
                  : "Choose what you’ll pay for. Nothing is charged until you start billing below."}
            </p>
          </div>
          <p className="text-right">
            <span className="text-2xl font-semibold text-emerald-300">
              €{total}
            </span>
            <span className="text-sm text-zinc-500">/mo</span>
          </p>
        </div>

        {neverConfigured ? (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Suggested for your venue type — save to unlock matching dashboard
            sections.
          </p>
        ) : null}

        {data.dataRetentionNote ? (
          <p className="mt-3 text-[11px] text-zinc-500">{data.dataRetentionNote}</p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {catalog.map((feature) => {
            const id = feature.id as AddOnId;
            const on = features.includes(id);
            const catalogDetails =
              ("details" in feature && feature.details) ||
              VENUE_ADD_ONS[id]?.details ||
              feature.tagline;
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
                          {feature.name}
                        </span>
                        <FeatureInfoTip details={catalogDetails} />
                        {recommended ? (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                            Suggested
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-emerald-300">
                        €{feature.monthlyPrice}
                        <span className="text-xs text-zinc-500">
                          {VENUE_ADD_ONS[id]?.pricedPerSeat ||
                          feature.pricedPerSeat
                            ? "/seat"
                            : "/mo"}
                        </span>
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {feature.tagline}
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
              Employee seats
            </label>
            <p className="mt-1 text-xs text-zinc-500">
              {trialActive
                ? `Free during trial — max ${trialSeatMax} logins. After trial you buy seats (€${VENUE_ADD_ONS.team_accounts.monthlyPrice}/seat).`
                : `Choose how many logins to buy, then create accounts on Employees. €${VENUE_ADD_ONS.team_accounts.monthlyPrice} × seats / month.`}
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
                  = €
                  {VENUE_ADD_ONS.team_accounts.monthlyPrice *
                    Math.max(1, seatQty)}
                  /mo
                </span>
              ) : (
                <span className="text-sm text-emerald-300">
                  Trial · {Math.min(maxSeats, seatQty || 1)}/{trialSeatMax}
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
            ? "Scheduled for next billing month. Current access unchanged until then."
            : "Saved. Sidebar visibility updated — your data was kept."}
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
          ? "Schedule for next month"
          : neverConfigured
            ? "Save features"
            : "Save features"}
      </button>
      {features.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Select at least one feature to continue.
        </p>
      ) : null}
    </div>
  );
}
