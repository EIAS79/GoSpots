import { TenantPage } from "@/components/layout/tenant-page";
import { IntegrationsWorkspace } from "@/components/enterprise/integrations-workspace";

export default function IntegrationsPage() {
  return (
    <TenantPage
      title="Integrations"
      description="Manage connector installations, scoped API access, signed webhooks, and durable integration jobs."
    >
      <IntegrationsWorkspace />
    </TenantPage>
  );
}
