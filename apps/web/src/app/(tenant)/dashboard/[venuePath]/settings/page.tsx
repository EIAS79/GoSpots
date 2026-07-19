"use client";

import { TenantPage } from "@/components/layout/tenant-page";
import { ShopSettingsPanel } from "@/components/settings/shop-settings-panel";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";

const GUIDE = DASHBOARD_SECTION_GUIDES.settings;

export default function SettingsPage() {
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "shop.manage"));

  return (
    <TenantPage
      title={GUIDE.title}
      description="Venue profile, location, marketing visibility, and regional preferences. Changes save automatically after 2 seconds."
      capabilities={GUIDE.capabilities}
    >
      {!canWrite ? (
        <p className="mb-4 text-xs text-zinc-500">
          View-only — you need venue settings permission to edit this page.
        </p>
      ) : null}
      <ShopSettingsPanel canWrite={canWrite} />
    </TenantPage>
  );
}
