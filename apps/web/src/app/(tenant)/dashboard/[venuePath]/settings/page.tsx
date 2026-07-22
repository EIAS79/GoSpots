"use client";

import { TenantPage } from "@/components/layout/tenant-page";
import { AuthMfaPanel } from "@/components/settings/auth-mfa-panel";
import { AuthSessionsPanel } from "@/components/settings/auth-sessions-panel";
import { MailOutboxPanel } from "@/components/settings/mail-outbox-panel";
import { OpsOutageRunbookPanel } from "@/components/settings/ops-outage-runbook-panel";
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
  const isOwner = membership?.role === "OWNER";
  const canWrite =
    state.status === "authed" &&
    (isOwner || hasPermission(membership?.permissions ?? "", "shop.manage"));

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
      <div className="space-y-6">
        <ShopSettingsPanel canWrite={canWrite} />
        {state.status === "authed" && isOwner ? <AuthMfaPanel /> : null}
        {state.status === "authed" ? <AuthSessionsPanel /> : null}
        {state.status === "authed" && isOwner ? <MailOutboxPanel /> : null}
        {state.status === "authed" && isOwner ? (
          <OpsOutageRunbookPanel />
        ) : null}
      </div>
    </TenantPage>
  );
}
