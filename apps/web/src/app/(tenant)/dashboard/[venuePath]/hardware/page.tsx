import { TenantPage } from "@/components/layout/tenant-page";
import { HardwareWorkspace } from "@/components/enterprise/hardware-workspace";

export default function HardwarePage() {
  return (
    <TenantPage
      title="Hardware & printing"
      description="Configure device-backed printing, customer displays, and barcode aliases for this venue."
    >
      <HardwareWorkspace />
    </TenantPage>
  );
}
