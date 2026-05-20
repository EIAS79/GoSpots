"use client";

import { PlayBillingPanel } from "@/components/finance/play-billing-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";

const GUIDE = DASHBOARD_SECTION_GUIDES.playBilling;

export default function PlayBillingPage() {
  const { state } = useAuth();
  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const perms = membership?.permissions ?? "";
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
      hasPermission(perms, "transaction.write"));

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
    >
      <PlayBillingPanel canWrite={canWrite} />
    </TenantPage>
  );
}
