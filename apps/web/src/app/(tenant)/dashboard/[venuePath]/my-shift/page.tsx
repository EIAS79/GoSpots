"use client";

import { MyShiftWorkspace } from "@/components/cash/my-shift-workspace";
import { TenantPage } from "@/components/layout/tenant-page";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export default function MyShiftPage() {
  const locale = useVenueSettingsOptional()?.locale ?? "en";

  return (
    <TenantPage
      title="My Shift"
      description="Open and reconcile your physical cash drawer for this shift."
      capabilities={[
        "Opening float and automatic cash-sale tracking",
        "Pay-in, pay-out, cash refund, and safe-drop movements",
        "Blind cash counting when venue policy requires it",
        "Variance approval before shift close when threshold is exceeded",
      ]}
      className="bg-zinc-950/30"
    >
      <MyShiftWorkspace locale={locale} />
    </TenantPage>
  );
}
