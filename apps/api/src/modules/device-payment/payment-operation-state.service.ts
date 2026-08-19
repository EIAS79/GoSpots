import { ConflictException, Injectable } from '@nestjs/common';
import { PaymentOperationState } from '@prisma/client';

const ALLOWED: Record<PaymentOperationState, ReadonlySet<PaymentOperationState>> = {
  CREATED: new Set(['PROCESSING', 'CANCELED']),
  PROCESSING: new Set([
    'REQUIRES_ACTION',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'CANCELED',
    'UNKNOWN',
  ]),
  REQUIRES_ACTION: new Set([
    'PROCESSING',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'CANCELED',
    'UNKNOWN',
  ]),
  AUTHORIZED: new Set(['CAPTURED', 'CANCELED', 'UNKNOWN']),
  CAPTURED: new Set(['PARTIALLY_REFUNDED', 'REFUNDED']),
  FAILED: new Set(),
  CANCELED: new Set(),
  UNKNOWN: new Set(['PROCESSING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELED']),
  PARTIALLY_REFUNDED: new Set(['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED']),
  REFUNDED: new Set(['CAPTURED', 'PARTIALLY_REFUNDED']),
};

function isRefundCorrection(
  from: PaymentOperationState,
  to: PaymentOperationState,
): boolean {
  return (
    (from === PaymentOperationState.PARTIALLY_REFUNDED ||
      from === PaymentOperationState.REFUNDED) &&
    (to === PaymentOperationState.CAPTURED ||
      to === PaymentOperationState.PARTIALLY_REFUNDED)
  );
}

@Injectable()
export class PaymentOperationStateService {
  assertTransition(
    from: PaymentOperationState,
    to: PaymentOperationState,
    options: { reconciliation?: boolean } = {},
  ): void {
    if (from === to) return;
    if (from === PaymentOperationState.UNKNOWN && !options.reconciliation) {
      throw new ConflictException(
        'Payment status is UNKNOWN. Reconcile with the provider before any retry or state change.',
      );
    }
    if (isRefundCorrection(from, to) && !options.reconciliation) {
      throw new ConflictException(
        'A refunded payment can move backwards only after provider reconciliation confirms a failed or reversed refund.',
      );
    }
    if (!ALLOWED[from].has(to)) {
      throw new ConflictException(`Invalid payment transition ${from} -> ${to}`);
    }
  }

  reconciliationRequired(state: PaymentOperationState): boolean {
    return state === PaymentOperationState.UNKNOWN;
  }
}
