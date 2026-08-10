"use client";

import { ShiftReportsWorkspace } from "@/components/cash/shift-reports-workspace";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export default function ShiftReportsPage() {
  const membership = useCurrentMembership();
  const locale = useVenueSettingsOptional()?.locale ?? "en";
  const canApproveVariance =
    membership?.role === "OWNER" ||
    hasPermission(membership?.permissions ?? "", "cash.approve_variance");

  return (
    <TenantPage
      title="Shift Reports"
      description="Reconcile physical cash sessions and approve material drawer variances."
      capabilities={[
        "Expected cash from opening float and movement ledger",
        "Counted cash and close variance",
        "Manager/owner variance approval",
        "Venue-wide cash-session and blind-count policy",
      ]}
      className="bg-zinc-950/30"
    >
      <ShiftReportsWorkspace
        locale={locale}
        canApproveVariance={canApproveVariance}
      />
    </TenantPage>
  );
}
