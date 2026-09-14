import { PaymentOperationState } from '@prisma/client';

export type CheckoutProviderOperation = {
  id: string;
  shopId: string;
  settlementId: string | null;
  checkoutPaymentId: string | null;
  terminalId: string | null;
  provider: string;
  providerPaymentId: string | null;
  idempotencyKey: string;
  requestHash: string;
  state: PaymentOperationState;
  amount: string;
  currency: string;
  reconciliationRequired: boolean;
  providerPayload: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdById: string | null;
  capturedAt: Date | string | null;
  canceledAt: Date | string | null;
  failedAt: Date | string | null;
  lastReconciledAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Provider payment operation response is invalid');
  }
  return value as Record<string, unknown>;
}

function stringField(
  row: Record<string, unknown>,
  key: string,
  nullable = false,
): string | null {
  const value = row[key];
  if (nullable && value == null) return null;
  if (typeof value !== 'string') {
    throw new TypeError(`Provider payment operation ${key} is invalid`);
  }
  return value;
}

function booleanField(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new TypeError(`Provider payment operation ${key} is invalid`);
  }
  return value;
}

function dateField(
  row: Record<string, unknown>,
  key: string,
  nullable = false,
): Date | string | null {
  const value = row[key];
  if (nullable && value == null) return null;
  if (value instanceof Date || typeof value === 'string') return value;
  throw new TypeError(`Provider payment operation ${key} is invalid`);
}

function stateField(row: Record<string, unknown>): PaymentOperationState {
  const value = stringField(row, 'state');
  if (!value || !(value in PaymentOperationState)) {
    throw new TypeError('Provider payment operation state is invalid');
  }
  return value as PaymentOperationState;
}

export function checkoutProviderOperation(value: unknown): CheckoutProviderOperation {
  const row = object(value);
  return {
    id: stringField(row, 'id')!,
    shopId: stringField(row, 'shopId')!,
    settlementId: stringField(row, 'settlementId', true),
    checkoutPaymentId: stringField(row, 'checkoutPaymentId', true),
    terminalId: stringField(row, 'terminalId', true),
    provider: stringField(row, 'provider')!,
    providerPaymentId: stringField(row, 'providerPaymentId', true),
    idempotencyKey: stringField(row, 'idempotencyKey')!,
    requestHash: stringField(row, 'requestHash')!,
    state: stateField(row),
    amount: stringField(row, 'amount')!,
    currency: stringField(row, 'currency')!,
    reconciliationRequired: booleanField(row, 'reconciliationRequired'),
    providerPayload: row.providerPayload ?? null,
    errorCode: stringField(row, 'errorCode', true),
    errorMessage: stringField(row, 'errorMessage', true),
    createdById: stringField(row, 'createdById', true),
    capturedAt: dateField(row, 'capturedAt', true),
    canceledAt: dateField(row, 'canceledAt', true),
    failedAt: dateField(row, 'failedAt', true),
    lastReconciledAt: dateField(row, 'lastReconciledAt', true),
    createdAt: dateField(row, 'createdAt')!,
    updatedAt: dateField(row, 'updatedAt')!,
  };
}
