"use client";

import { TenantPage } from "@/components/layout/tenant-page";
import { GalleryPanel } from "@/components/gallery/gallery-panel";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";

const GUIDE = DASHBOARD_SECTION_GUIDES.gallery;

export default function GalleryPage() {
  const { state } = useAuth();
  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
      hasPermission(membership?.permissions ?? "", "gallery.write"));

  return (
    <TenantPage
      title={GUIDE.title}
      description="Upload your main marketing image and gallery photos customers see on your public venue page."
      capabilities={GUIDE.capabilities}
    >
      <GalleryPanel canWrite={canWrite} />
    </TenantPage>
  );
}
