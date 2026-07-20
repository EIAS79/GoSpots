"use client";

import { FinanceHub } from "@/components/finance/finance-hub";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettings } from "@/lib/venue-settings-context";

export default function FinancePage() {
  const { state } = useAuth();
  const access = useVenueAccess();
  const membership = useCurrentMembership();
  const guide = useDashboardGuide("finance");
  const { t } = useVenueSettings();
  const perms = membership?.permissions ?? "";
  const transactionUnlocked = isFeatureUnlocked(
    access.enabledModules,
    "transaction",
  );
  const reportsUnlocked = isFeatureUnlocked(access.enabledModules, "reports");
  const unlocked = transactionUnlocked || reportsUnlocked;
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(perms, "transaction.write"));

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      {!canWrite ? (
        <p className="mb-4 text-xs text-zinc-500">
          {t("subscription.viewOnlyFinance")}
        </p>
      ) : null}
      <FeatureGate
        feature="transaction"
        unlocked={unlocked}
        title={guide.title}
      >
        <FinanceHub canWrite={canWrite && transactionUnlocked} />
      </FeatureGate>
    </TenantPage>
  );
}
