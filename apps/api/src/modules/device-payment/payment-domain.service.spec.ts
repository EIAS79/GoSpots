import {
  PaymentOperationState,
  RefundState,
  Prisma,
} from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FakePaymentConnector } from './connectors/fake-payment.connector';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { PaymentDomainService } from './payment-domain.service';
import { PaymentOperationStateService } from './payment-operation-state.service';

function d(value: string | number) {
  return new Prisma.Decimal(value);
}

function actor(shopId = 'shop-1'): JwtAccessPayload {
  return {
    sub: 'owner-1',
    shopId,
    shopRole: 'OWNER',
    perms: '*',
  } as JwtAccessPayload;
}

function makeHarness() {
  const operations: any[] = [];
  const refunds: any[] = [];
  const refundAllocations: any[] = [];
  const webhookEvents: any[] = [];
  let opCounter = 0;
  let refundCounter = 0;
  let eventCounter = 0;

  const paymentOperation = {
    findUnique: jest.fn(async ({ where }: any) => {
      const key = where.shopId_provider_idempotencyKey;
      if (!key) return null;
      return (
        operations.find(
          (row) =>
            row.shopId === key.shopId &&
            row.provider === key.provider &&
            row.idempotencyKey === key.idempotencyKey,
        ) ?? null
      );
    }),
    findFirst: jest.fn(async ({ where, include }: any) => {
      const row =
        operations.find(
          (item) =>
            (!where.id || item.id === where.id) &&
            (!where.shopId || item.shopId === where.shopId) &&
            (!where.provider || item.provider === where.provider),
        ) ?? null;
      if (!row) return null;
      if (include?.refunds) {
        return {
          ...row,
          refunds: refunds.filter(
            (refund) =>
              refund.paymentOperationId === row.id &&
              refund.state === RefundState.SUCCEEDED,
          ),
        };
      }
      return row;
    }),
    create: jest.fn(async ({ data }: any) => {
      opCounter += 1;
      const now = new Date('2026-08-10T10:00:00Z');
      const row = {
        id: `op-${opCounter}`,
        providerPaymentId: null,
        checkoutPaymentId: null,
        reconciliationRequired: false,
        providerPayload: null,
        errorCode: null,
        errorMessage: null,
        capturedAt: null,
        canceledAt: null,
        failedAt: null,
        lastReconciledAt: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      operations.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = operations.find((item) => item.id === where.id);
      if (!row) throw new Error('operation missing');
      Object.assign(row, data, { updatedAt: new Date('2026-08-10T10:01:00Z') });
      return row;
    }),
  };

  const refund = {
    findUnique: jest.fn(async ({ where, include }: any) => {
      const key = where.shopId_paymentOperationId_idempotencyKey;
      const row = key
        ? refunds.find(
            (item) =>
              item.shopId === key.shopId &&
              item.paymentOperationId === key.paymentOperationId &&
              item.idempotencyKey === key.idempotencyKey,
          )
        : null;
      if (!row) return null;
      return include?.allocations
        ? { ...row, allocations: refundAllocations.filter((a) => a.refundId === row.id) }
        : row;
    }),
    create: jest.fn(async ({ data }: any) => {
      refundCounter += 1;
      const row = {
        id: `refund-${refundCounter}`,
        providerRefundId: null,
        providerPayload: null,
        errorCode: null,
        errorMessage: null,
        succeededAt: null,
        failedAt: null,
        lastReconciledAt: null,
        createdAt: new Date('2026-08-10T10:02:00Z'),
        updatedAt: new Date('2026-08-10T10:02:00Z'),
        ...data,
      };
      refunds.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data, include }: any) => {
      const row = refunds.find((item) => item.id === where.id);
      if (!row) throw new Error('refund missing');
      Object.assign(row, data);
      return include?.allocations
        ? { ...row, allocations: refundAllocations.filter((a) => a.refundId === row.id) }
        : row;
    }),
  };

  const paymentWebhookEvent = {
    findUnique: jest.fn(async ({ where }: any) => {
      const key = where.shopId_provider_eventId;
      return (
        webhookEvents.find(
          (item) =>
            item.shopId === key.shopId &&
            item.provider === key.provider &&
            item.eventId === key.eventId,
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: any) => {
      eventCounter += 1;
      const row = { id: `event-${eventCounter}`, receivedAt: new Date(), ...data };
      webhookEvents.push(row);
      return row;
    }),
  };

  const tx: any = {
    refund,
    refundAllocation: {
      createMany: jest.fn(async ({ data }: any) => {
        for (const item of data) {
          refundAllocations.push({ id: `ra-${refundAllocations.length + 1}`, ...item });
        }
        return { count: data.length };
      }),
    },
    paymentWebhookEvent,
    paymentOperation,
  };
  const prisma: any = {
    paymentOperation,
    paymentTerminal: { findFirst: jest.fn().mockResolvedValue(null) },
    refund,
    paymentWebhookEvent,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
  const registry = new PaymentConnectorRegistry();
  registry.register(new FakePaymentConnector());
  const service = new PaymentDomainService(
    prisma,
    flags,
    registry,
    new PaymentOperationStateService(),
  );
  return {
    service,
    prisma,
    operations,
    refunds,
    refundAllocations,
    webhookEvents,
  };
}

describe('PaymentDomainService', () => {
  it('creates one provider payment and replays the same idempotency key', async () => {
    const h = makeHarness();
    const first = await h.service.startPayment(
      actor(),
      { provider: 'fake', amount: '100', currency: 'pln', metadata: { scenario: 'success' } },
      'same-key',
    );
    const replay = await h.service.startPayment(
      actor(),
      { provider: 'FAKE', amount: '100.0000', currency: 'PLN', metadata: { scenario: 'success' } },
      'same-key',
    );
    expect(first.id).toBe(replay.id);
    expect(first.state).toBe(PaymentOperationState.CAPTURED);
    expect(h.prisma.paymentOperation.create).toHaveBeenCalledTimes(1);
  });

  it('rejects idempotency-key reuse with a different request', async () => {
    const h = makeHarness();
    await h.service.startPayment(
      actor(),
      { provider: 'fake', amount: '10', currency: 'PLN' },
      'collision-key',
    );
    await expect(
      h.service.startPayment(
        actor(),
        { provider: 'fake', amount: '11', currency: 'PLN' },
        'collision-key',
      ),
    ).rejects.toThrow(/different payment request/i);
  });

  it('persists timeout as UNKNOWN and reconciles before any retry', async () => {
    const h = makeHarness();
    const unknown = await h.service.startPayment(
      actor(),
      {
        provider: 'fake',
        amount: '30',
        currency: 'PLN',
        metadata: { scenario: 'timeout_captured' },
      },
      'timeout-key',
    );
    expect(unknown.state).toBe(PaymentOperationState.UNKNOWN);
    expect(unknown.reconciliationRequired).toBe(true);

    const replay = await h.service.startPayment(
      actor(),
      {
        provider: 'fake',
        amount: '30',
        currency: 'PLN',
        metadata: { scenario: 'timeout_captured' },
      },
      'timeout-key',
    );
    expect(replay.state).toBe(PaymentOperationState.UNKNOWN);
    expect(h.prisma.paymentOperation.create).toHaveBeenCalledTimes(1);

    const reconciled = await h.service.reconcile(actor(), unknown.id);
    expect(reconciled.state).toBe(PaymentOperationState.CAPTURED);
    expect(reconciled.reconciliationRequired).toBe(false);
  });

  it('models a partial refund with immutable allocation lineage', async () => {
    const h = makeHarness();
    const payment = await h.service.startPayment(
      actor(),
      { provider: 'fake', amount: '100', currency: 'PLN' },
      'payment-key',
    );
    const refunded = await h.service.createRefund(
      actor(),
      payment.id,
      {
        amount: '25',
        reason: 'guest adjustment',
        allocations: [{ snapshotId: 'snapshot-1', amount: '25' }],
      },
      'refund-key',
    );
    expect(refunded.state).toBe(RefundState.SUCCEEDED);
    expect(refunded.allocations).toHaveLength(1);
    expect(refunded.allocations[0].snapshotId).toBe('snapshot-1');
    expect(h.operations[0].state).toBe(PaymentOperationState.PARTIALLY_REFUNDED);
  });

  it('treats duplicate normalized webhook delivery as harmless', async () => {
    const h = makeHarness();
    const payment = await h.service.startPayment(
      actor(),
      { provider: 'fake', amount: '15', currency: 'PLN' },
      'webhook-payment',
    );
    const body = {
      shopId: 'shop-1',
      provider: 'fake',
      eventId: 'evt-1',
      payloadHash: 'hash-1',
      paymentOperationId: payment.id,
      state: PaymentOperationState.CAPTURED,
    };
    const first = await h.service.ingestNormalizedWebhook(body);
    const duplicate = await h.service.ingestNormalizedWebhook(body);
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(h.webhookEvents).toHaveLength(1);
  });

  it('does not return another Shop payment operation', async () => {
    const h = makeHarness();
    const payment = await h.service.startPayment(
      actor('shop-1'),
      { provider: 'fake', amount: '10', currency: 'PLN' },
      'tenant-key',
    );
    await expect(h.service.getOperation(actor('shop-2'), payment.id)).rejects.toThrow(
      /not found/i,
    );
  });
});
