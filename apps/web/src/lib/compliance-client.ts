import { api } from "./api";
import {
  idempotencyActionKey,
  withIdempotentFinanceCall,
} from "./idempotency-key";

export type ComplianceOperationalState =
  | "UNPAID"
  | "PAID"
  | "FISCALIZING"
  | "ISSUED"
  | "ACTION_REQUIRED";

export type ComplianceProfile = {
  id: string;
  shopId: string;
  jurisdiction: string;
  legalName: string;
  taxId: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  countryCode: string;
  defaultTaxCategoryCode: string | null;
  ksefEnvironment: "TEST" | "DEMO" | "PRD";
  hasKsefToken: boolean;
};

export type TaxCategory = {
  id: string;
  code: string;
  label: string;
  ratePercent: string;
  active: boolean;
};

export type ComplianceRequestView = {
  id: string;
  state: string;
  externalReference: string | null;
  reconciliationRequired: boolean;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ComplianceDocumentView = {
  id: string;
  kind: "RECEIPT" | "INVOICE" | "CORRECTION" | "REFUND";
  state: string;
  documentNumber: string | null;
  ksefNumber: string | null;
  lastRequest?: ComplianceRequestView | null;
  requests?: ComplianceRequestView[];
};

export type SettlementComplianceStatus = {
  settlementId: string;
  paid: boolean;
  state: ComplianceOperationalState;
  document: ComplianceDocumentView | null;
};

export type ComplianceReconciliation = {
  totalPaidSettlements: number;
  missingDocument: number;
  actionRequired: number;
  rows: Array<{
    settlementId: string;
    guestCheckId: string;
    amount: string;
    currency: string;
    paidAt: string;
    complianceState: ComplianceOperationalState;
    documentId: string | null;
    documentNumber: string | null;
    ksefNumber: string | null;
    actionRequired: boolean;
    lastError: string | null;
  }>;
};

export function fetchComplianceProfile() {
  return api<ComplianceProfile | null>("/compliance/profile");
}

export function configureComplianceProfile(body: {
  legalName: string;
  taxId: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  defaultTaxCategoryCode?: string;
  ksefEnvironment?: "TEST" | "DEMO" | "PRD";
  ksefToken?: string;
}) {
  return api<ComplianceProfile>("/compliance/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function fetchTaxCategories() {
  return api<TaxCategory[]>("/compliance/tax-categories");
}

export function upsertTaxCategory(body: {
  code: string;
  label: string;
  ratePercent: string;
  active?: boolean;
}) {
  return api<TaxCategory>("/compliance/tax-categories", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function fetchSettlementComplianceStatus(settlementId: string) {
  return api<SettlementComplianceStatus>(
    `/compliance/settlements/${encodeURIComponent(settlementId)}/status`,
  );
}

export function generateSettlementComplianceDocument(
  settlementId: string,
  body: {
    kind: "RECEIPT" | "INVOICE";
    buyerName?: string;
    buyerTaxId?: string;
  },
) {
  return api<ComplianceDocumentView>(
    `/compliance/settlements/${encodeURIComponent(settlementId)}/documents`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function fetchComplianceDocument(id: string) {
  return api<ComplianceDocumentView>(`/compliance/documents/${encodeURIComponent(id)}`);
}

export function submitComplianceDocumentToKsef(documentId: string) {
  const actionKey = idempotencyActionKey("compliance.ksef.submit", { documentId });
  return withIdempotentFinanceCall(actionKey, (key) =>
    api<ComplianceRequestView>(
      `/compliance/documents/${encodeURIComponent(documentId)}/ksef`,
      { method: "POST", headers: { "Idempotency-Key": key } },
    ),
  );
}

export function reconcileComplianceRequest(requestId: string) {
  return api<ComplianceRequestView>(
    `/compliance/requests/${encodeURIComponent(requestId)}/reconcile`,
    { method: "POST" },
  );
}

export function fetchComplianceReconciliation() {
  return api<ComplianceReconciliation>("/compliance/reconciliation");
}
