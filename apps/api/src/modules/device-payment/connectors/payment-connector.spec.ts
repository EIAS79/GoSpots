import { FakePaymentConnector } from './fake-payment.connector';
import { PaymentConnectorRegistry } from './payment-connector.registry';

describe('provider-neutral payment connectors', () => {
  it('resolves connectors through the registry without provider branching', () => {
    const registry = new PaymentConnectorRegistry();
    const fake = new FakePaymentConnector();
    registry.register(fake);
    expect(registry.resolve('FAKE')).toBe(fake);
    expect(registry.providers()).toEqual(['fake']);
  });

  it('simulates success, decline, unknown reconciliation and refund', async () => {
    const fake = new FakePaymentConnector();
    const success = await fake.createPayment({
      operationId: 'op-success',
      idempotencyKey: 'key-success',
      amount: '100.0000',
      currency: 'PLN',
      metadata: { scenario: 'success' },
    });
    expect(success.state).toBe('CAPTURED');

    const decline = await fake.createPayment({
      operationId: 'op-decline',
      idempotencyKey: 'key-decline',
      amount: '20.0000',
      currency: 'PLN',
      metadata: { scenario: 'decline' },
    });
    expect(decline.state).toBe('FAILED');

    const unknown = await fake.createPayment({
      operationId: 'op-timeout',
      idempotencyKey: 'key-timeout',
      amount: '30.0000',
      currency: 'PLN',
      metadata: { scenario: 'timeout_captured' },
    });
    expect(unknown.state).toBe('UNKNOWN');
    const reconciled = await fake.getPayment({
      providerPaymentId: unknown.providerPaymentId,
    });
    expect(reconciled.state).toBe('CAPTURED');

    const refund = await fake.refundPayment({
      refundId: 'refund-1',
      paymentProviderId: success.providerPaymentId,
      idempotencyKey: 'refund-key',
      amount: '25.0000',
      currency: 'PLN',
    });
    expect(refund.state).toBe('SUCCEEDED');
    expect(refund.providerRefundId).toMatch(/^fake-refund-/);
  });
});
