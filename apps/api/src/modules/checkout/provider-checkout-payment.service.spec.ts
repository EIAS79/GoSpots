import { PaymentAllocationKind, PaymentOperationState } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ProviderCheckoutPaymentService } from './provider-checkout-payment.service';

const actor = {
  sub: 'cashier-a',
  shopId: 'shop-a',
  shopRole: 'CASHIER',
  perms: 'checkout.read,checkout.write',
} as JwtAccessPayload;

const intent = {
  expectedCheckVersion: 3,
  allocationKind: PaymentAllocationKind.REMAINING,
  allocations: [{ snapshotId: 'snapshot-a', amount: '10.0000' }],
};

function harness(state: PaymentOperationState, checkoutPaymentId: string | null = null) {
  const operation: any = {
    id: 'operation-a',
    shopId: 'shop-a',
    settlementId: 'settlement-a',
    amount: '10.0000',
    currency: 'PLN',
    state,
    checkoutPaymentId,
    providerPayload: null,
    reconciliationRequired: state === PaymentOperationState.UNKNOWN,
  };
  const prisma: any = {
    payment: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'payment-a' }) },
    paymentOperation: {
      update: jest.fn(async ({ data }: any) => Object.assign(operation, data)),
    },
  };
  const providerPayments: any = {
    getOperation: jest.fn().mockImplementation(async () => operation),
    reconcile: jest.fn().mockImplementation(async () => {
      operation.state = PaymentOperationState.CAPTURED;
      operation.reconciliationRequired = false;
      return operation;
    }),
  };
  const checkoutPayments: any = {
    recordCapturedProviderPayment: jest.fn().mockResolvedValue({ state: 'PAID' }),
    getPaymentState: jest.fn().mockResolvedValue({ state: 'PAID' }),
  };
  return {
    operation,
    prisma,
    providerPayments,
    checkoutPayments,
    service: new ProviderCheckoutPaymentService(prisma, providerPayments, checkoutPayments),
  };
}

describe('ProviderCheckoutPaymentService captured-operation finalization', () => {
  it('finalizes only a captured provider operation and returns the linked checkout state', async () => {
    const h = harness(PaymentOperationState.CAPTURED);
    const result = await h.service.reconcile(actor, 'operation-a', intent);
    expect(result.checkoutFinalizationRequired).toBe(false);
    expect(result.paymentState).toEqual({ state: 'PAID' });
    expect(h.checkoutPayments.recordCapturedProviderPayment).toHaveBeenCalledWith(
      actor,
      'settlement-a',
      expect.objectContaining({ allocations: intent.allocations, method: 'MANUAL_CARD' }),
      'operation-a',
    );
    expect(h.operation.checkoutPaymentId).toBe('payment-a');
    expect(h.operation.reconciliationRequired).toBe(false);
    expect(h.providerPayments.reconcile).not.toHaveBeenCalled();
  });

  it('does not create another checkout payment for an already finalized operation', async () => {
    const h = harness(PaymentOperationState.CAPTURED, 'payment-existing');
    const result = await h.service.reconcile(actor, 'operation-a', intent);
    expect(result.checkoutFinalizationRequired).toBe(false);
    expect(h.checkoutPayments.recordCapturedProviderPayment).not.toHaveBeenCalled();
    expect(h.prisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it('does not mark a declined payment successful', async () => {
    const h = harness(PaymentOperationState.FAILED);
    const result = await h.service.reconcile(actor, 'operation-a', intent);
    expect(result.operation.state).toBe(PaymentOperationState.FAILED);
    expect(result.checkoutFinalizationRequired).toBe(false);
    expect(h.checkoutPayments.recordCapturedProviderPayment).not.toHaveBeenCalled();
    expect(h.prisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it('reconciles UNKNOWN before considering a provider payment captured', async () => {
    const h = harness(PaymentOperationState.UNKNOWN);
    const result = await h.service.reconcile(actor, 'operation-a', intent);
    expect(h.providerPayments.reconcile).toHaveBeenCalledWith(actor, 'operation-a');
    expect(result.checkoutFinalizationRequired).toBe(false);
    expect(h.checkoutPayments.recordCapturedProviderPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses mismatched capture amount before creating checkout payment', async () => {
    const h = harness(PaymentOperationState.CAPTURED);
    await expect(h.service.reconcile(actor, 'operation-a', {
      ...intent,
      allocations: [{ snapshotId: 'snapshot-a', amount: '9.0000' }],
    })).rejects.toThrow(/no longer matches the captured provider amount/);
    expect(h.checkoutPayments.recordCapturedProviderPayment).not.toHaveBeenCalled();
  });

  it('marks checkout finalization required without fabricating success when finalization throws', async () => {
    const h = harness(PaymentOperationState.CAPTURED);
    h.checkoutPayments.recordCapturedProviderPayment.mockRejectedValueOnce(
      new Error('Guest check version has changed'),
    );
    const result = await h.service.reconcile(actor, 'operation-a', intent);
    expect(result.checkoutFinalizationRequired).toBe(true);
    expect(result.operation.reconciliationRequired).toBe(true);
    expect(result.operation.errorCode).toBe('CHECKOUT_FINALIZATION_REQUIRED');
    expect(result.operation.checkoutPaymentId).toBeNull();
    expect(h.checkoutPayments.getPaymentState).toHaveBeenCalled();
  });

  it('rejects reconciliation when the operation is not attached to a settlement', async () => {
    const h = harness(PaymentOperationState.CAPTURED);
    h.operation.settlementId = null;
    await expect(h.service.reconcile(actor, 'operation-a', intent))
      .rejects.toThrow(/not linked to checkout/);
    expect(h.checkoutPayments.recordCapturedProviderPayment).not.toHaveBeenCalled();
  });
});
