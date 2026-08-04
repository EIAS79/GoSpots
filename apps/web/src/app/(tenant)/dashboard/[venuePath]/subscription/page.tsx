"use client";

import { AlertTriangle, Clock, Crown, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TenantPage } from "@/components/layout/tenant-page";
import { BillingCheckoutCard } from "@/components/subscription/billing-checkout-card";
import { VenuePackPanel } from "@/components/subscription/venue-pack-panel";
import {
  fetchBillingCheckoutStatus,
  fetchBillingPayments,
  fetchBillingStatus,
  fetchDualBillingSubscription,
  fetchSubscription,
  isDualBillingStatus,
  peekPendingBillingOperation,
  clearPendingBillingOperation,
  type DualBillingSubscription,
  type SubscriptionResponse,
} from "@/lib/dashboard-client";
import { TRIAL_DURATION_DAYS } from "@/lib/plan";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useAuth } from "@/lib/use-auth";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";
import type { VenuePackId } from "@/lib/venue-packs";

const FAILED_PAYMENT_STATUSES = new Set([
  "FAILED",
  "CANCELED",
  "EXPIRED",
]);
const SUCCESS_SUB_STATUSES = new Set(["ACTIVE", "TRIALING"]);

function formatPeriodDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function paymentMethodLabel(
  sub: DualBillingSubscription,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const methods = sub.billingAccount?.paymentMethods ?? [];
  const pm =
    methods.find((m) => m.isDefault) ?? methods[0] ?? null;
  if (!pm) return t("subscription.paymentMethodNone");
  if (pm.last4) {
    const brand = pm.cardBrand || pm.type || "Card";
    return t("subscription.paymentMethodCard", {
      brand,
      last4: pm.last4,
    });
  }
  if (pm.bankName) {
    return t("subscription.paymentMethodBank", { bank: pm.bankName });
  }
  if (pm.type) return pm.type;
  return t("subscription.paymentMethodOnFile");
}

function SubscriptionPageInner() {
  const { reload } = useAuth();
  const { formatFromEur, formatMoney, t, currency } = useVenueSettings();
  const onboardingHref = useVenueHref("/onboarding");
  const guide = useDashboardGuide("subscription");
  const searchParams = useSearchParams();
  const router = useRouter();
  const subscriptionHref = useVenueHref("/subscription");

  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [dualSub, setDualSub] = useState<DualBillingSubscription | null>(null);
  const [dualEnabled, setDualEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<
    "paid" | "failed" | "timeout" | null
  >(null);

  const refreshDual = useCallback(async () => {
    try {
      const status = await fetchBillingStatus();
      const enabled = isDualBillingStatus(status);
      setDualEnabled(enabled);
      if (!enabled) {
        setDualSub(null);
        return;
      }
      const { subscription } = await fetchDualBillingSubscription();
      setDualSub(subscription);
    } catch {
      setDualEnabled(false);
      setDualSub(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [sub] = await Promise.all([fetchSubscription(), refreshDual()]);
    setData(sub);
    void reload();
  }, [refreshDual, reload]);

  useEffect(() => {
    fetchSubscription()
      .then(async (sub) => {
        setData(sub);
        await refreshDual();
      })
      .finally(() => setLoading(false));
  }, [refreshDual]);

  // Confirming payment: never trust URL alone — poll checkout + payments.
  useEffect(() => {
    const billing = searchParams.get("billing");
    const opFromQuery = searchParams.get("op");
    const shouldConfirm =
      billing === "confirming" ||
      billing === "success" ||
      billing === "renewed";

    if (!shouldConfirm) return;

    const operationId =
      opFromQuery || peekPendingBillingOperation() || null;

    if (!operationId && billing === "success") {
      // Legacy Lemon return — soft success only.
      setConfirmResult("paid");
      return;
    }

    if (!operationId) return;

    let cancelled = false;
    setConfirming(true);
    setConfirmResult(null);

    const started = Date.now();
    const maxMs = 90_000;

    function finish(result: "paid" | "failed" | "timeout") {
      clearPendingBillingOperation();
      setConfirming(false);
      setConfirmResult(result);
      router.replace(subscriptionHref);
    }

    async function tick() {
      if (cancelled) return;
      try {
        const [op, payments, dual] = await Promise.all([
          fetchBillingCheckoutStatus(operationId!).catch(() => null),
          fetchBillingPayments(10).catch(() => ({ items: [] })),
          fetchDualBillingSubscription().catch(() => ({
            subscription: null,
          })),
        ]);

        if (cancelled) return;

        if (dual.subscription) setDualSub(dual.subscription);

        const subStatus = dual.subscription?.canonicalStatus;
        const response = op?.response as
          | { billingSubscriptionId?: string }
          | null
          | undefined;
        const subId = response?.billingSubscriptionId;
        const relatedPayments = subId
          ? payments.items.filter((p) => p.subscriptionId === subId)
          : [];
        const latestRelated = relatedPayments[0];
        const paidPayment = latestRelated?.canonicalStatus === "PAID";
        const failedPayment =
          !!latestRelated &&
          FAILED_PAYMENT_STATUSES.has(latestRelated.canonicalStatus);
        const paid =
          !!paidPayment ||
          (!!subStatus && SUCCESS_SUB_STATUSES.has(subStatus));
        const failed =
          op?.status === "FAILED" ||
          op?.status === "EXPIRED" ||
          !!failedPayment ||
          (!!subStatus &&
            (subStatus === "PROVIDER_ERROR" ||
              subStatus === "INCOMPLETE_EXPIRED"));

        if (paid) {
          await fetchSubscription().then(setData);
          void reload();
          finish("paid");
          return;
        }
        if (failed && !paid) {
          finish("failed");
          return;
        }
      } catch {
        /* keep polling */
      }

      if (Date.now() - started > maxMs) {
        if (!cancelled) finish("timeout");
        return;
      }

      window.setTimeout(() => void tick(), 2000);
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [searchParams, reload, router, subscriptionHref]);

  const packId = (data?.packId ?? "gaming") as VenuePackId;
  const packName = t(`pack.${packId}.name`);
  const trialActive = data?.trialActive ?? false;
  const trialExpired = data?.trialExpired ?? false;
  const staffLimit = data?.staffLimit ?? 0;
  const staffUsed = data?.staffUsed ?? 0;
  const billingSuccess =
    searchParams.get("billing") === "success" && !dualEnabled;
  const needsFeatureSetup = !data?.addOns?.trim();

  const addOnIds = useMemo(
    () =>
      (data?.addOns ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [data?.addOns],
  );

  const graceActive =
    !!dualSub?.gracePeriodEndsAt &&
    new Date(dualSub.gracePeriodEndsAt).getTime() > Date.now() &&
    (dualSub.canonicalStatus === "PAST_DUE" ||
      dualSub.canonicalStatus === "UNPAID");

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      ) : data ? (
        <div className="space-y-6">
          {confirming ? (
            <p className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              <Loader2 size={16} className="animate-spin shrink-0" />
              {t("subscription.confirmingPayment")}
            </p>
          ) : null}

          {confirmResult === "paid" || billingSuccess ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {t("subscription.paymentSubmitted")}
            </p>
          ) : null}

          {confirmResult === "failed" ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {t("subscription.paymentConfirmFailed")}
            </p>
          ) : null}

          {confirmResult === "timeout" ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {t("subscription.paymentConfirmTimeout")}
            </p>
          ) : null}

          {graceActive && dualSub?.gracePeriodEndsAt ? (
            <div className="flex gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0 text-amber-400"
              />
              <div>
                <p className="font-medium">{t("subscription.graceTitle")}</p>
                <p className="mt-1 text-xs text-amber-200/80">
                  {t("subscription.graceBody", {
                    ends: formatPeriodDate(dualSub.gracePeriodEndsAt),
                  })}
                </p>
              </div>
            </div>
          ) : null}

          {needsFeatureSetup ? (
            <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              <p className="font-medium">
                {t("subscription.gettingStartedTitle")}
              </p>
              <p className="mt-1 text-xs text-sky-200/80">
                {trialActive
                  ? t("subscription.gettingStartedBodyTrial", { pack: packName })
                  : t("subscription.gettingStartedBodyPaid", { pack: packName })}
              </p>
              <Link
                href={onboardingHref}
                className="mt-2 inline-block text-xs text-sky-200/90 underline-offset-2 hover:underline"
              >
                {t("subscription.optionalSetupChecklist")}
              </Link>
            </div>
          ) : null}

          {trialActive ? (
            <div className="flex gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <Clock size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium">
                  {t("subscription.trialHeadline", {
                    days: TRIAL_DURATION_DAYS,
                    left: data.trialDaysRemaining,
                    dayWord:
                      data.trialDaysRemaining === 1
                        ? t("subscription.day")
                        : t("subscription.days"),
                  })}
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  {t("subscription.trialBody", {
                    seats: data.trialStaffSeatLimit ?? 3,
                    ends: data.subscription?.trialEndsAt
                      ? new Date(
                          data.subscription.trialEndsAt,
                        ).toLocaleDateString()
                      : t("subscription.trialEndsFallback"),
                    price: formatFromEur(data.monthlyTotal),
                  })}
                </p>
              </div>
            </div>
          ) : null}

          {trialExpired ? (
            <div className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0 text-rose-400"
              />
              <div>
                <p className="font-medium">{t("subscription.trialEndedTitle")}</p>
                <p className="mt-1 text-xs text-rose-200/80">
                  {t("subscription.trialEndedBody", {
                    price: formatFromEur(data.monthlyTotal),
                  })}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-transparent p-6">
            <div className="flex flex-wrap items-center gap-2 text-amber-200">
              <Crown size={18} />
              <span className="text-lg font-semibold">{packName}</span>
              {trialActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                  <Sparkles size={12} /> {t("subscription.activeTrial")}
                </span>
              ) : null}
              {data.subscription?.status === "ACTIVE" && !trialActive ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                  {t("subscription.paidActive")}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              {t("subscription.featuresTotal", {
                price: formatFromEur(data.monthlyTotal),
              })}
              {staffLimit > 0
                ? t("subscription.staffSeats", {
                    used: staffUsed,
                    limit: staffLimit,
                  })
                : t("subscription.employeeSeatsNone")}
            </p>
          </div>

          {dualEnabled && dualSub ? (
            <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-5">
              <h2 className="text-sm font-semibold text-white">
                {t("subscription.billingStatusTitle")}
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.billingProviderLabel")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">{dualSub.provider}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.renewalModeLabel")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {dualSub.renewalMode === "MANUAL_MONTHLY"
                      ? t("subscription.renewalManual")
                      : t("subscription.renewalAutomatic")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.billingStatusLabel")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {dualSub.canonicalStatus}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.periodStart")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {formatPeriodDate(dualSub.currentPeriodStart)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.periodEnd")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {formatPeriodDate(dualSub.currentPeriodEnd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.nextAmount")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {formatMoney(dualSub.amountMinor / 100, dualSub.currency)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-zinc-500">
                    {t("subscription.paymentMethodLabel")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {paymentMethodLabel(dualSub, t)}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <VenuePackPanel
            data={data}
            onUpdated={(next) => {
              setData(next);
              void reload();
            }}
          />

          {!needsFeatureSetup ? (
            <BillingCheckoutCard
              monthlyTotal={data.monthlyTotal}
              configured={data.billingConfigured ?? dualEnabled}
              missingEnv={data.billingMissingEnv}
              hasLemonSub={!!data.lemonSubscriptionId}
              trialActive={trialActive}
              trialExpired={trialExpired}
              packId={data.packId ?? packId}
              addOnIds={addOnIds}
              seatQuantity={data.staffSeatQuantity ?? 0}
              currency={currency}
              dualSubscription={dualSub}
              onDualUpdated={() => void refreshAll()}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">{t("subscription.loadError")}</p>
      )}
    </TenantPage>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <SubscriptionPageInner />
    </Suspense>
  );
}
