"use client";

import { TenantPage } from "@/components/layout/tenant-page";
import { ShopSettingsPanel } from "@/components/settings/shop-settings-panel";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";

const GUIDE = DASHBOARD_SECTION_GUIDES.settings;

export default function SettingsPage() {
  return (
    <TenantPage
      title={GUIDE.title}
      description="Venue profile, location, marketing visibility, and regional preferences. Changes save automatically after 2 seconds."
      capabilities={GUIDE.capabilities}
    >
      <ShopSettingsPanel />
    </TenantPage>
  );
}
