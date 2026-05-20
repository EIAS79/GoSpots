"use client";

import { AlertTriangle, Clock, Crown, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { PlanCatalog } from "@/components/subscription/plan-catalog";
import { SubscriptionPricingPanel } from "@/components/subscription/subscription-pricing-panel";
import { fetchSubscription } from "@/lib/dashboard-client";
import { cn } from "@/lib/cn";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import {
  buildMarketingCatalogForTier,
  TIER_LABELS,
  TRIAL_DURATION_DAYS,
  type SubscriptionTier,
} from "@/lib/plan";

const GUIDE = DASHBOARD_SECTION_GUIDES.subscription;

export default function SubscriptionPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchSubscription>
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const effective = (data?.effectiveTier ?? "FREE") as SubscriptionTier;
  const billed = (data?.billedTier ??
    data?.subscription?.tier ??
    "FREE") as SubscriptionTier;
  const trialActive = data?.trialActive ?? false;
  const trialExpired = data?.trialExpired ?? false;
  const staffLimit = data?.staffLimit ?? 0;
  const staffUsed = data?.staffUsed ?? 0;
  const staffPct =
    staffLimit > 0 ? Math.min(100, (staffUsed / staffLimit) * 100) : 0;

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      ) : (
        <div className="space-y-6">
          {trialActive ? (
            <div className="flex gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <Clock size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium">
                  {TRIAL_DURATION_DAYS}-day {TIER_LABELS[billed]} trial —{" "}
                  {data?.trialDaysRemaining ?? 0} day
                  {(data?.trialDaysRemaining ?? 0) === 1 ? "" : "s"} left
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  Starter features are unlocked until{" "}
                  {data?.subscription?.trialEndsAt
                    ? new Date(data.subscription.trialEndsAt).toLocaleDateString()
                    : "trial ends"}
                  . Employee accounts stay owner-only (0 seats).
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
                <p className="font-medium">Your free trial has ended</p>
                <p className="mt-1 text-xs text-rose-200/80">
                  Your {TRIAL_DURATION_DAYS}-day {TIER_LABELS[billed]} trial is
                  over. Dashboard and marketplace features below are locked until
                  you pick a paid plan. Open plans & pricing to compare options.
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-transparent p-6">
            <div className="flex flex-wrap items-center gap-2 text-amber-200">
              <Crown size={18} />
              <span className="text-lg font-semibold">
                {trialActive
                  ? `${TIER_LABELS[billed]} trial`
                  : TIER_LABELS[effective]}
              </span>
              {trialActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                  <Sparkles size={12} /> Active trial
                </span>
              ) : null}
              {!trialActive && billed !== effective ? (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">
                  Billed {TIER_LABELS[billed]} · effective {TIER_LABELS[effective]}
                </span>
              ) : null}
            </div>

            {data?.subscription && !trialActive && !trialExpired ? (
              <p className="mt-2 text-sm text-zinc-400">
                Status:{" "}
                <span className="text-zinc-300">{data.subscription.status}</span>
              </p>
            ) : null}

            {effective === "FREE" && !trialActive && !trialExpired ? (
              <p className="mt-2 text-sm text-zinc-500">
                Free plan — everything visible, features locked until you upgrade
                or start a trial.
              </p>
            ) : null}

            <div className="mt-5">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Employee accounts</span>
                <span>
                  {staffUsed} / {staffLimit}
                  {staffLimit === 0 ? " (owner only)" : ""}
                </span>
              </div>
              {staffLimit > 0 ? (
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      staffPct >= 100 ? "bg-rose-500" : "bg-emerald-500",
                    )}
                    style={{ width: `${staffPct}%` }}
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">
                  Starter and Free include the owner only. Standard adds 5 seats;
                  Pro adds 20 with roles & permissions.
                </p>
              )}
            </div>
          </div>

          <SubscriptionPricingPanel
            currentTier={billed}
            defaultOpen={trialExpired || effective === "FREE"}
          />

          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
              {trialExpired ? "Locked after trial" : "Included on your plan"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {trialActive
                ? "Unlocked during your trial — same layout you will see after subscribing."
                : trialExpired
                  ? "Subscribe to turn these back on."
                  : "Four areas: operations, revenue, team, and public discovery."}
            </p>
            <div className="mt-5">
              <PlanCatalog
                dashboardFeatures={data?.features ?? []}
                marketingFeatures={
                  data?.marketingFeatures ??
                  buildMarketingCatalogForTier(effective)
                }
              />
            </div>
          </div>
        </div>
      )}
    </TenantPage>
  );
}
