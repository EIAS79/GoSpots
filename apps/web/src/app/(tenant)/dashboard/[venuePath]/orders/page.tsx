"use client";

import { MenuOrdersPanel } from "@/components/finance/menu-orders-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueAccess } from "@/lib/use-venue-access";

const GUIDE = DASHBOARD_SECTION_GUIDES.orders;

export default function OrdersPage() {
  const { state } = useAuth();
  const access = useVenueAccess();
  const membership = useCurrentMembership();
  const perms = membership?.permissions ?? "";
  const unlocked = isFeatureUnlocked(access.enabledModules, "transaction");
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(perms, "transaction.write"));

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
    >
      {!canWrite ? (
        <p className="mb-4 text-xs text-zinc-500">
          View-only — ask an admin for transaction write access to edit orders.
        </p>
      ) : null}
      <FeatureGate feature="transaction" unlocked={unlocked} title="Menu orders">
        <MenuOrdersPanel canWrite={canWrite && unlocked} />
      </FeatureGate>
    </TenantPage>
  );
}
