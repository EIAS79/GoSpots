import { api } from "./api";
import {
  idempotencyActionKey,
  withIdempotentFinanceCall,
} from "./idempotency-key";
import type { CheckoutPreview } from "./checkout-client";

export type CommercialCheckType =
  | "SESSION"
  | "RESTAURANT_TABLE"
  | "BAR_TAB"
  | "COUNTER_SALE"
  | "TAKEAWAY"
  | "RESERVATION_EVENT"
  | "RETAIL";
export type CommercialAdjustmentType =
  | "PERCENTAGE_DISCOUNT"
  | "FIXED_DISCOUNT"
  | "MANAGER_COMP"
  | "PRICE_OVERRIDE"
  | "PROMOTION"
  | "DEPOSIT_APPLICATION";
export type CommercialAdjustmentScope = "CHECK" | "LINE";
export type CommercialTipMethod = "CASH" | "CARD" | "OTHER";

export type CommercialCheckContext = {
  check: {
    id: string;
    status: string;
    version: number;
    openedAt: string;
    settledAt: string | null;
  };
  profile: null | {
    id: string;
    checkType: CommercialCheckType;
    assignedOperatorId: string | null;
    resourceId: string | null;
    operationsSessionId: string | null;
    tableReference: string | null;
    customerId: string | null;
    serviceArea: string | null;
  };
  adjustments: Array<{
    id: string;
    type: CommercialAdjustmentType;
    scope: CommercialAdjustmentScope;
    amountMinor: number | null;
    percentageBps: number | null;
    reason: string;
    beforeTotalMinor: number;
    afterTotalMinor: number;
    voidedAt: string | null;
  }>;
  serviceCharges: Array<{
    id: string;
    mode: "FIXED" | "PERCENTAGE";
    amountMinor: number | null;
    percentageBps: number | null;
    reason: string;
    voidedAt: string | null;
  }>;
  tips: Array<{
    id: string;
    method: CommercialTipMethod;
    amountMinor: number;
    note: string | null;
    voidedAt: string | null;
  }>;
  transfers: Array<{ id: string; reason: string; createdAt: string }>;
  reopens: Array<{ id: string; reason: string; disposition: string; createdAt: string }>;
  projection: CheckoutPreview | null;
};

function mutate<T>(scope: string, request: unknown, path: string, body: unknown) {
  const actionKey = idempotencyActionKey(scope, request);
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<T>(path, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
  );
}

export function fetchCommercialCheck(checkId: string) {
  return api<CommercialCheckContext>(`/commercial/checks/${checkId}`);
}

export function updateCommercialCheckProfile(
  checkId: string,
  body: {
    expectedCheckVersion: number;
    checkType: CommercialCheckType;
    assignedOperatorId?: string;
    resourceId?: string;
    operationsSessionId?: string;
    tableReference?: string;
    customerId?: string;
    serviceArea?: string;
  },
) {
  const request = { checkId, ...body };
  const actionKey = idempotencyActionKey("commercial.check.profile", request);
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api(`/commercial/checks/${checkId}/profile`, {
      method: "PUT",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
  );
}

export function transferCommercialCheck(
  checkId: string,
  body: {
    expectedCheckVersion: number;
    reason: string;
    assignedOperatorId?: string;
    resourceId?: string;
    operationsSessionId?: string;
    serviceArea?: string;
  },
) {
  return mutate(
    "commercial.check.transfer",
    { checkId, ...body },
    `/commercial/checks/${checkId}/transfer`,
    body,
  );
}

export function applyCommercialAdjustment(
  checkId: string,
  body: {
    expectedCheckVersion: number;
    type: CommercialAdjustmentType;
    scope?: CommercialAdjustmentScope;
    source?: "MANUAL" | "PROMOTION" | "MEMBERSHIP" | "DEPOSIT" | "SYSTEM";
    targetSourceType?: string;
    targetSourceId?: string;
    targetLineReference?: string;
    amountMinor?: number;
    percentageBps?: number;
    reason: string;
  },
) {
  return mutate(
    "commercial.check.adjustment.apply",
    { checkId, ...body },
    `/commercial/checks/${checkId}/adjustments`,
    body,
  );
}

export function addCommercialServiceCharge(
  checkId: string,
  body: {
    expectedCheckVersion: number;
    mode: "FIXED" | "PERCENTAGE";
    amountMinor?: number;
    percentageBps?: number;
    reason: string;
  },
) {
  return mutate(
    "commercial.check.service-charge.add",
    { checkId, ...body },
    `/commercial/checks/${checkId}/service-charges`,
    body,
  );
}

export function addCommercialTip(
  checkId: string,
  body: {
    expectedCheckVersion: number;
    method: CommercialTipMethod;
    amountMinor: number;
    note?: string;
  },
) {
  return mutate(
    "commercial.check.tip.add",
    { checkId, ...body },
    `/commercial/checks/${checkId}/tips`,
    body,
  );
}

export function reopenCommercialCheck(
  checkId: string,
  body: { expectedCheckVersion: number; reason: string },
) {
  return mutate(
    "commercial.check.reopen",
    { checkId, ...body },
    `/commercial/checks/${checkId}/reopen`,
    body,
  );
}

export function completeCommercialVenueOrder(
  orderId: string,
  expectedVersion: number,
) {
  const body = { expectedVersion };
  return mutate(
    "commercial.order.complete",
    { orderId, ...body },
    `/commercial/orders/${orderId}/complete`,
    body,
  );
}

export function fetchCommercialDayCloseGuard() {
  return api<{
    allowed: boolean;
    openTabCount: number;
    policyAllowsOpenTabs: boolean;
    managerOverrideAvailable: boolean;
    openChecks: Array<{
      id: string;
      label: string | null;
      guestName: string | null;
      openedAt: string;
    }>;
  }>("/commercial/day-close/open-tab-guard");
}

export function closeCommercialDay(body: {
  businessDate: string;
  reason?: string;
}) {
  return mutate(
    "commercial.day-close",
    body,
    "/commercial/day-close",
    body,
  );
}
