import { api } from "./api";
import {
  idempotencyActionKey,
  withIdempotentFinanceCall,
} from "./idempotency-key";

export type CheckoutChargeSourceType =
  | "SHOP_ORDER"
  | "PLAY_SESSION"
  | "RESERVATION";

export type CheckoutChargeLine = {
  position: number;
  sourceType: CheckoutChargeSourceType;
  sourceId: string;
  lineReference: string | null;
  description: string;
  quantity: number;
  unitAmount: string;
  grossAmount: string;
  discountAmount: string;
  finalAmount: string;
  currency: string;
  pricingMetadata: unknown;
};

export type CheckoutPreview = {
  checkId: string;
  checkVersion: number;
  sourceHash: string;
  currency: string;
  subtotal: string;
  adjustments: string;
  taxAmount: string;
  depositAmount: string;
  total: string;
  amountDue: string;
  lines: CheckoutChargeLine[];
};

export type CheckoutSettlementState =
  | "OPEN"
  | "CALCULATED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CLOSED"
  | "VOID";

export type PaymentAllocationKind =
  | "LINE"
  | "SOURCE"
  | "EQUAL"
  | "PERCENTAGE"
  | "CUSTOM"
  | "REMAINING";

export type CheckoutPaymentMethod = "CASH" | "MANUAL_CARD" | "OTHER";
export type CheckoutPaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "VOID";

export type CheckoutSettlement = {
  id: string;
  shopId: string;
  guestCheckId: string;
  state: CheckoutSettlementState;
  checkVersion: number;
  sourceHash: string;
  subtotal: string;
  adjustments: string;
  taxAmount: string;
  depositAmount: string;
  total: string;
  amountDue: string;
  currency: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  snapshots: Array<{
    id: string;
    position: number;
    sourceType: CheckoutChargeSourceType;
    sourceId: string;
    lineReference: string | null;
    description: string;
    quantity: number;
    unitAmount: string;
    grossAmount: string;
    discountAmount: string;
    finalAmount: string;
    currency: string;
    pricingMetadata: unknown;
    createdAt: string;
  }>;
};

export type PaymentAllocationPreviewPart = {
  snapshotId: string;
  sourceType: string;
  sourceId: string;
  lineReference: string | null;
  description: string;
  amount: string;
  quantity: string;
};

export type PaymentGroupPreview = {
  key: string;
  label: string;
  allocationKind: PaymentAllocationKind;
  amount: string;
  currency: string;
  allocations: PaymentAllocationPreviewPart[];
};

export type PaymentGroupsPreview = {
  settlementId: string;
  guestCheckId: string;
  guestCheckVersion: number;
  state: CheckoutSettlementState;
  amountDue: string;
  allocationKind: PaymentAllocationKind;
  currency: string;
  remainingTotal: string;
  groups: PaymentGroupPreview[];
};

export type CheckoutPaymentState = {
  settlementId: string;
  guestCheckId: string;
  guestCheckVersion: number;
  state: CheckoutSettlementState;
  currency: string;
  total: string;
  paidAmount: string;
  amountDue: string;
  payments: Array<{
    id: string;
    method: CheckoutPaymentMethod;
    status: CheckoutPaymentStatus;
    amount: string;
    currency: string;
    note: string | null;
    succeededAt: string | null;
    failedAt: string | null;
    createdAt: string;
    allocations: Array<{
      id: string;
      snapshotId: string;
      allocationKind: PaymentAllocationKind;
      amount: string;
      quantity: string;
      sourceType: string | null;
      sourceId: string | null;
    }>;
  }>;
};

export type GuestCheckMergeResult = {
  mergeEventId: string;
  sourceCheckId: string;
  destinationCheckId: string;
  sourceVersion: number;
  destinationVersion: number;
  movedShopOrderIds: string[];
  movedPlaySessionIds: string[];
  movedReservationIds: string[];
  createdAt: string;
};

export function previewCheckout(checkId: string, expectedVersion?: number) {
  return api<CheckoutPreview>(`/checkout/checks/${checkId}/preview`, {
    method: "POST",
    body: JSON.stringify(
      expectedVersion === undefined ? {} : { expectedVersion },
    ),
  });
}

export function createCheckSettlement(checkId: string, expectedVersion: number) {
  const body = { expectedVersion };
  const actionKey = idempotencyActionKey("checkout.settlement.create", {
    checkId,
    ...body,
  });
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<CheckoutSettlement>(`/checkout/checks/${checkId}/settlements`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
  );
}

export function fetchCheckoutPaymentState(settlementId: string) {
  return api<CheckoutPaymentState>(
    `/checkout/settlements/${settlementId}/payment-state`,
  );
}

export function previewPaymentGroups(
  settlementId: string,
  body: {
    mode: PaymentAllocationKind;
    parts?: number;
    percentage?: number;
    customAmounts?: string[];
  },
) {
  return api<PaymentGroupsPreview>(
    `/checkout/settlements/${settlementId}/payment-groups/preview`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function createCheckoutPayment(
  settlementId: string,
  body: {
    expectedCheckVersion: number;
    method: CheckoutPaymentMethod;
    allocationKind: PaymentAllocationKind;
    allocations: Array<{ snapshotId: string; amount: string }>;
    note?: string;
  },
) {
  const actionKey = idempotencyActionKey("checkout.payment.create", {
    settlementId,
    ...body,
  });
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<CheckoutPaymentState>(`/checkout/settlements/${settlementId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
  );
}

export function mergeGuestChecks(
  destinationCheckId: string,
  body: {
    sourceCheckId: string;
    expectedDestinationVersion: number;
    expectedSourceVersion: number;
  },
) {
  const actionKey = idempotencyActionKey("checkout.check.merge", {
    destinationCheckId,
    ...body,
  });
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<GuestCheckMergeResult>(`/checkout/checks/${destinationCheckId}/merge`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
  );
}

export function moveGuestCheckCharges(
  sourceCheckId: string,
  body: {
    destinationCheckId: string;
    expectedSourceVersion: number;
    expectedDestinationVersion: number;
    shopOrderIds?: string[];
    playSessionIds?: string[];
    reservationIds?: string[];
  },
) {
  const actionKey = idempotencyActionKey("checkout.check.move-charges", {
    sourceCheckId,
    ...body,
  });
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<{
      sourceCheckId: string;
      destinationCheckId: string;
      sourceVersion: number;
      destinationVersion: number;
      shopOrderIds: string[];
      playSessionIds: string[];
      reservationIds: string[];
    }>(`/checkout/checks/${sourceCheckId}/move-charges`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
  );
}

export function fetchGuestCheckMergeHistory(checkId: string) {
  return api<{
    checkId: string;
    events: Array<{
      id: string;
      sourceCheck: { id: string; label: string | null; guestName: string | null };
      destinationCheck: {
        id: string;
        label: string | null;
        guestName: string | null;
      };
      actorId: string | null;
      movedShopOrderIds: string[];
      movedPlaySessionIds: string[];
      movedReservationIds: string[];
      createdAt: string;
    }>;
  }>(`/checkout/checks/${checkId}/merge-history`);
}
