import { api } from "./api";

export type SystemTenant = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  subscription: null | {
    tier: string;
    status: string;
    packId: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    staffSeatQuantity: number;
    billingSubscriptionId: string | null;
  };
  featureFlags: Array<{ feature: string; enabled: boolean }>;
};

export type SystemTenantDiagnostics = {
  shop: { id: string; name: string; slug: string; updatedAt: string };
  counts: {
    memberships: number;
    devices: number;
    deadIntegrationJobs: number;
    deadWebhookDeliveries: number;
    importJobs: number;
  };
  checkedAt: string;
};

export function fetchSystemTenants(query = "") {
  const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return api<{
    tenants: SystemTenant[];
    supportAccess: {
      invisibleImpersonation: boolean;
      mode: string;
      mutationAuditRequired: boolean;
    };
  }>(`/phase13/system/tenants${qs}`);
}

export function fetchSystemTenantDiagnostics(shopId: string) {
  return api<SystemTenantDiagnostics>(
    `/phase13/system/tenants/${encodeURIComponent(shopId)}/diagnostics`,
  );
}

export function updateSystemTenantSubscription(
  shopId: string,
  input: { tier?: string; status?: string; packId?: string; staffSeatQuantity?: number },
) {
  return api<SystemTenant["subscription"]>(
    `/phase13/system/tenants/${encodeURIComponent(shopId)}/subscription`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function updateSystemTenantFeature(
  shopId: string,
  input: { key: string; enabled: boolean },
) {
  return api<{ shopId: string; feature: string; enabled: boolean }>(
    `/phase13/system/tenants/${encodeURIComponent(shopId)}/feature`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}
