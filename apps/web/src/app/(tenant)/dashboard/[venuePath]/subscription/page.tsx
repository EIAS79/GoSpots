"use client";

import { AlertTriangle, Clock, Crown, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
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
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useAuth } from "@/lib/use-auth";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";
import type { VenuePackId } from "@/lib/venue-packs";

function SubscriptionPageInner() {
  const { reload } = useAuth();
  const { formatFromEur, t } = useVenueSettings();
  const onboardingHref = useVenueHref("/onboarding");
  const guide = useDashboardGuide("subscription");
  const searchParams = useSearchParams();
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const packId = (data?.packId ?? "gaming") as VenuePackId;
  const packName = t(`pack.${packId}.name`);
  const trialActive = data?.trialActive ?? false;
  const trialExpired = data?.trialExpired ?? false;
  const staffLimit = data?.staffLimit ?? 0;
  const staffUsed = data?.staffUsed ?? 0;
  const billingSuccess = searchParams.get("billing") === "success";
  const needsFeatureSetup = !data?.addOns?.trim();

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
          {billingSuccess ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {t("subscription.paymentSubmitted")}
            </p>
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
              missingEnv={data.billingMissingEnv}
              hasLemonSub={!!data.lemonSubscriptionId}
              trialActive={trialActive}
              trialExpired={trialExpired}
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
