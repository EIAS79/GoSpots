"use client";

import { StaffApprovalsPanel } from "@/components/staff/staff-approvals-panel";
import { TenantPage } from "@/components/layout/tenant-page";

export default function StaffApprovalsPage() {
  return (
    <TenantPage
      title="Staff approvals"
      description="One-time approvals for menu and game price edits when staff lack write permission. Approving never grants lasting access."
    >
      <StaffApprovalsPanel />
    </TenantPage>
  );
}
