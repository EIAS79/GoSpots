import { api } from "./api";
import {
  idempotencyActionKey,
  withIdempotentFinanceCall,
} from "./idempotency-key";
import type {
  CheckoutPaymentState,
  PaymentAllocationKind,
} from "./checkout-client";

export type ProviderPaymentOperationState =
  | "CREATED"
  | "PROCESSING"
  | "REQUIRES_ACTION"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CANCELED"
  | "UNKNOWN"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

export type ProviderRefundState =
  | "CREATED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "UNKNOWN";

export type ProviderCheckoutPaymentOperation = {
  id: string;
  settlementId: string | null;
  checkoutPaymentId: string | null;
  terminalId: string | null;
  provider: string;
  providerPaymentId: string | null;
  state: ProviderPaymentOperationState;
  amount: string;
  currency: string;
  reconciliationRequired: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderCheckoutResult = {
  operation: ProviderCheckoutPaymentOperation;
  paymentState: CheckoutPaymentState | null;
  checkoutFinalizationRequired: boolean;
};

export type ProviderCheckoutAllocation = {
  snapshotId: string;
  amount: string;
};

export type ProviderCheckoutIntent = {
  allocationKind: PaymentAllocationKind;
  allocations: ProviderCheckoutAllocation[];
};

export type ActiveProviderCheckout = {
  operation: ProviderCheckoutPaymentOperation;
  paymentState: CheckoutPaymentState;
  intent: ProviderCheckoutIntent | null;
};

export type ProviderCheckoutRefund = {
  id: string;
  state: ProviderRefundState;
  amount: string;
  currency: string;
  providerRefundId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderCheckoutPaymentSummary = {
  id: string;
  checkoutPaymentId: string | null;
  provider: string;
  state: ProviderPaymentOperationState;
  amount: string;
  currency: string;
  refundedAmount: string;
  refundableAmount: string;
  pendingRefund: boolean;
  canRefund: boolean;
  refunds: ProviderCheckoutRefund[];
};

export type ProviderCheckoutBody = {
  expectedCheckVersion: number;
  provider: string;
  terminalId: string;
  allocationKind: PaymentAllocationKind;
  allocations: ProviderCheckoutAllocation[];
  note?: string;
};

export function collectProviderCheckoutPayment(
  settlementId: string,
  body: ProviderCheckoutBody,
) {
  const actionKey = idempotencyActionKey("checkout.provider-payment.collect", {
    settlementId,
    ...body,
  });
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<ProviderCheckoutResult>(
      `/checkout/settlements/${settlementId}/provider-payments`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      },
    ),
  );
}

export function fetchActiveProviderCheckoutPayment(settlementId: string) {
  return api<ActiveProviderCheckout | null>(
    `/checkout/settlements/${settlementId}/provider-payment-active`,
  );
}

export function fetchProviderCheckoutPayments(settlementId: string) {
  return api<ProviderCheckoutPaymentSummary[]>(
    `/checkout/settlements/${settlementId}/provider-payments`,
  );
}

export function reconcileProviderCheckoutPayment(
  operationId: string,
  body: Omit<ProviderCheckoutBody, "provider" | "terminalId">,
) {
  return api<ProviderCheckoutResult>(
    `/checkout/provider-payments/${operationId}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function cancelProviderCheckoutPayment(operationId: string) {
  return api<ProviderCheckoutResult>(
    `/checkout/provider-payments/${operationId}/cancel`,
    { method: "POST" },
  );
}

export function refundRemainingProviderCheckoutPayment(
  operationId: string,
  reason = "Checkout card refund",
) {
  const actionKey = idempotencyActionKey("checkout.provider-payment.refund", {
    operationId,
    reason,
  });
  return withIdempotentFinanceCall(actionKey, (idempotencyKey) =>
    api<ProviderCheckoutRefund>(
      `/checkout/provider-payments/${operationId}/refund-remaining`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ reason }),
      },
    ),
  );
}