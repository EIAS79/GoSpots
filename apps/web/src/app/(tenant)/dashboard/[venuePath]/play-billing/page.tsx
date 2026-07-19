"use client";

import { GameBillingPanel } from "@/components/finance/game-billing-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";

export default function GameBillingPage() {
  const guide = useDashboardGuide("playBilling");
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const access = useVenueAccess();
  const unlocked = isFeatureUnlocked(access.enabledModules, "transaction");
  const perms = membership?.permissions ?? "";
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
      <FeatureGate feature="transaction" unlocked={unlocked} title="Game billing">
        <GameBillingPanel canWrite={canWrite} />
      </FeatureGate>
    </TenantPage>
  );
}
