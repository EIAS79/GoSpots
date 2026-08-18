import { AccessWorkspace } from "@/components/enterprise/access-workspace";
import { TenantPage } from "@/components/layout/tenant-page";

export default function AccessPage() {
  return (
    <TenantPage
      title="Access & lockers"
      description="Issue paid admission entitlements, control QR/RFID access, monitor occupancy, configure scanners, and manage lockers."
    >
      <AccessWorkspace />
    </TenantPage>
  );
}
