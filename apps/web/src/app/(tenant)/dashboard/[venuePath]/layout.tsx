import { BillingPurchaseTracker } from "@/components/analytics/billing-purchase-tracker";
import { TenantShell } from "@/components/layout/tenant-shell";
import { VenueGate } from "@/components/layout/venue-gate";
import type { ReactNode } from "react";

export default function VenueDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <VenueGate>
      <BillingPurchaseTracker />
      <TenantShell>{children}</TenantShell>
    </VenueGate>
  );
}
