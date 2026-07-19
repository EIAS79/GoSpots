"use client";

import { TenantPage } from "@/components/layout/tenant-page";
import { ShopSettingsPanel } from "@/components/settings/shop-settings-panel";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export default function SettingsPage() {
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const guide = useDashboardGuide("settings");
  const t = useVenueSettingsOptional()?.t;
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "shop.manage"));

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      {!canWrite ? (
        <p className="mb-4 text-xs text-zinc-500">
          {t?.("common.viewOnly") ??
            "View-only — ask your admin for edit access."}
        </p>
      ) : null}
      <ShopSettingsPanel canWrite={canWrite} />
    </TenantPage>
  );
}
