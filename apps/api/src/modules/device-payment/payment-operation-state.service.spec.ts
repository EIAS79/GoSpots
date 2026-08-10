import { PaymentOperationState } from '@prisma/client';
import { PaymentOperationStateService } from './payment-operation-state.service';

describe('PaymentOperationStateService', () => {
  const service = new PaymentOperationStateService();

  it('allows the provider-neutral happy path', () => {
    expect(() =>
      service.assertTransition(
        PaymentOperationState.CREATED,
        PaymentOperationState.PROCESSING,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        PaymentOperationState.PROCESSING,
        PaymentOperationState.CAPTURED,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        PaymentOperationState.CAPTURED,
        PaymentOperationState.PARTIALLY_REFUNDED,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        PaymentOperationState.PARTIALLY_REFUNDED,
        PaymentOperationState.REFUNDED,
      ),
    ).not.toThrow();
  });

  it('makes UNKNOWN a reconciliation-only state', () => {
    expect(() =>
      service.assertTransition(
        PaymentOperationState.PROCESSING,
        PaymentOperationState.UNKNOWN,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        PaymentOperationState.UNKNOWN,
        PaymentOperationState.CAPTURED,
      ),
    ).toThrow(/Reconcile with the provider/i);
    expect(() =>
      service.assertTransition(
        PaymentOperationState.UNKNOWN,
        PaymentOperationState.CAPTURED,
        { reconciliation: true },
      ),
    ).not.toThrow();
  });

  it('does not allow a terminal failure to be retried as processing', () => {
    expect(() =>
      service.assertTransition(
        PaymentOperationState.FAILED,
        PaymentOperationState.PROCESSING,
      ),
    ).toThrow(/Invalid payment transition/i);
  });
});
