"use client";

import { TenantPage } from "@/components/layout/tenant-page";
import { GalleryPanel } from "@/components/gallery/gallery-panel";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";

export default function GalleryPage() {
  const guide = useDashboardGuide("gallery");
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "gallery.write"));

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      <GalleryPanel canWrite={canWrite} />
    </TenantPage>
  );
}
