"use client";

import { GuestChecksPanel } from "@/components/guest-check/guest-checks-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export default function GuestChecksPage() {
  const guide = useDashboardGuide("guestChecks");
  const { state } = useAuth();
  const t = useVenueSettingsOptional()?.t ?? ((k: string) => k);
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
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      {!canWrite ? (
        <p className="mb-4 text-xs text-zinc-500">
          {t("guestChecks.viewOnly")}
        </p>
      ) : null}
      <FeatureGate
        feature="transaction"
        unlocked={unlocked}
        title={t("guestChecks.gateTitle")}
      >
        <GuestChecksPanel canWrite={canWrite && unlocked} />
      </FeatureGate>
    </TenantPage>
  );
}
