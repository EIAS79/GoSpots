"use client";

import { AlertTriangle, Clock, Crown, Loader2, Sparkles } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TenantPage } from "@/components/layout/tenant-page";
import { BillingCheckoutCard } from "@/components/subscription/billing-checkout-card";
import { VenuePackPanel } from "@/components/subscription/venue-pack-panel";
import {
  fetchSubscription,
  type SubscriptionResponse,
} from "@/lib/dashboard-client";
import { TRIAL_DURATION_DAYS } from "@/lib/plan";
import { VENUE_PACKS, type VenuePackId } from "@/lib/venue-packs";
import { useAuth } from "@/lib/use-auth";
import { useVenueSettings } from "@/lib/venue-settings-context";

function SubscriptionPageInner() {
  const { reload } = useAuth();
  const { formatFromEur } = useVenueSettings();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const packId = (data?.packId ?? "gaming") as VenuePackId;
  const packName = VENUE_PACKS[packId]?.name ?? "Venue";
  const trialActive = data?.trialActive ?? false;
  const trialExpired = data?.trialExpired ?? false;
  const staffLimit = data?.staffLimit ?? 0;
  const staffUsed = data?.staffUsed ?? 0;
  const billingSuccess = searchParams.get("billing") === "success";
  const needsFeatureSetup = !data?.addOns?.trim();

  return (
    <TenantPage
      title="Subscription & features"
      description="Pay only for features you keep. Nothing is charged without you starting checkout. Turning a feature off never deletes your data."
      capabilities={[
        `${TRIAL_DURATION_DAYS}-day free trial — add/remove features anytime; sidebar updates on save.`,
        `Up to 3 employee logins during trial when Team accounts is on.`,
        "After trial: all features stay off until you pay — no auto-charge.",
        "On a paid plan, feature changes apply next billing month (no mid-cycle refunds).",
      ]}
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      ) : data ? (
        <div className="space-y-6">
          {billingSuccess ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Payment submitted. If modules are still locked, wait a few seconds
              for the webhook — then refresh.
            </p>
          ) : null}

          {needsFeatureSetup && trialActive ? (
            <p className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Pick features for{" "}
              <span className="font-medium text-white">{packName}</span> and
              save — matching dashboard sections unlock. You can change them
              freely during the trial.
            </p>
          ) : null}

          {needsFeatureSetup && !trialActive ? (
            <p className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Choose the features below for{" "}
              <span className="font-medium text-white">{packName}</span>, save,
              then start billing when you’re ready. Nothing is charged until
              then.
            </p>
          ) : null}

          {trialActive ? (
            <div className="flex gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <Clock size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium">
                  {TRIAL_DURATION_DAYS}-day free trial ·{" "}
                  {data.trialDaysRemaining} day
                  {data.trialDaysRemaining === 1 ? "" : "s"} left
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  Add/remove features anytime — visibility updates when you
                  save. Up to {data.trialStaffSeatLimit ?? 3} employee seats
                  free with Team accounts. After{" "}
                  {data.subscription?.trialEndsAt
                    ? new Date(
                        data.subscription.trialEndsAt,
                      ).toLocaleDateString()
                    : "trial ends"}
                  , everything turns off until you pay (
                  {formatFromEur(data.monthlyTotal)}
                  /mo) — no charge without checkout. Your data stays.
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
                <p className="font-medium">
                  Trial ended — features are off until you pay
                </p>
                <p className="mt-1 text-xs text-rose-200/80">
                  Adjust your plan below if needed, then start billing for{" "}
                  {formatFromEur(data.monthlyTotal)}/mo. Nothing is charged
                  without your consent. All your data is still here and returns
                  when features turn back on.
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
                  <Sparkles size={12} /> Active trial
                </span>
              ) : null}
              {data.subscription?.status === "ACTIVE" && !trialActive ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                  Paid · active
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              Features total{" "}
              <span className="font-medium text-emerald-300">
                {formatFromEur(data.monthlyTotal)}/mo
              </span>
              {staffLimit > 0
                ? ` · Staff seats ${staffUsed}/${staffLimit}`
                : " · Employee seats 0/0 (buy on Team accounts)"}
            </p>
          </div>

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
              configured={data.billingConfigured ?? false}
              hasLemonSub={!!data.lemonSubscriptionId}
              trialActive={trialActive}
              trialExpired={trialExpired}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Could not load subscription.</p>
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
