"use client";

import { MenuOrdersPanel } from "@/components/finance/menu-orders-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export default function OrdersPage() {
  const guide = useDashboardGuide("orders");
  const { state } = useAuth();
  const t = useVenueSettingsOptional()?.t ?? ((k: string) => k);
  const access = useVenueAccess();
  const membership = useCurrentMembership();
  const perms = membership?.permissions ?? "";
  const menuUnlocked = isFeatureUnlocked(access.enabledModules, "menu");
  const transactionUnlocked = isFeatureUnlocked(
    access.enabledModules,
    "transaction",
  );
  const unlocked = menuUnlocked && transactionUnlocked;
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
        <p className="mb-4 text-xs text-zinc-500">{t("orders.viewOnly")}</p>
      ) : null}
      <FeatureGate
        feature="menu"
        unlocked={unlocked}
        title={t("orders.gateTitle")}
      >
        <MenuOrdersPanel canWrite={canWrite && unlocked} />
      </FeatureGate>
    </TenantPage>
  );
}
