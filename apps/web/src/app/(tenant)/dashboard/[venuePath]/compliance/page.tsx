"use client";

import { ComplianceAdminPanel } from "@/components/compliance/compliance-admin-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { useCurrentMembership } from "@/lib/use-current-membership";

export default function CompliancePage() {
  const membership = useCurrentMembership();
  const canManage =
    membership?.role === "OWNER" ||
    hasPermission(membership?.permissions ?? "", "shop.manage");

  return (
    <TenantPage
      title="Poland compliance"
      description="Fiscal receipt, KSeF and paid-settlement reconciliation diagnostics."
      capabilities={[
        "Immutable fiscal documents generated from paid settlement snapshots",
        "Explicit tax-category configuration — no guessed VAT",
        "Fiscal-device/provider status and retry-safe reconciliation",
        "KSeF references, numbers and UPO evidence",
      ]}
      className="bg-zinc-950/30"
    >
      <ComplianceAdminPanel canManage={canManage} />
    </TenantPage>
  );
}
