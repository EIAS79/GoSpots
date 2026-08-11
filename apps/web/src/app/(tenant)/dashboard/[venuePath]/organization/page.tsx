import { TenantPage } from "@/components/layout/tenant-page";
import { OrganizationWorkspace } from "@/components/enterprise/organization-workspace";

export default function OrganizationPage() {
  return (
    <TenantPage
      title="Organization & locations"
      description="Manage multi-location structure, group access, shared settings foundation, and cross-location analytics."
    >
      <OrganizationWorkspace />
    </TenantPage>
  );
}
