import { createHash } from 'crypto';
import { EdgeContinuityService } from './edge-continuity.service';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
function hash(payload: unknown) {
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

const basePayload = {
  settlementId: 'settlement-1',
  operatorUserId: 'cashier-1',
  amountMinor: 2500,
  currency: 'PLN',
  allocationKind: 'CUSTOM',
  allocations: [{ snapshotId: 'snap-1', amount: '25.00' }],
};

function cashDto(overrides: Record<string, unknown> = {}): any {
  const payload = (overrides.payload as Record<string, unknown> | undefined) ?? basePayload;
  return {
    operationId: '11111111-1111-4111-8111-111111111111',
    deviceId: 'pos-a',
    venueId: 'shop-1',
    localSequence: 12,
    idempotencyKey: 'cash-visit-1',
    operationType: 'CASH_PAYMENT',
    aggregateType: 'CheckSettlement',
    entityId: 'settlement-1',
    expectedVersion: 7,
    occurredAt: '2026-08-18T20:00:00.000Z',
    correlationId: 'visit-1',
    payload,
    payloadHash: hash(payload),
    ...overrides,
  };
}

function fixture(options: { receipt?: any; payment?: any; permissions?: string[]; role?: string } = {}) {
  const idempotencyReceipt = {
    findUnique: jest.fn().mockResolvedValue(options.receipt ?? null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma: any = {
    membership: {
      findFirst: jest.fn().mockResolvedValue({
        userId: 'cashier-1',
        shopId: 'shop-1',
        role: options.role ?? 'CASHIER',
        isActive: true,
        permissionRows: (options.permissions ?? ['checkout.read', 'checkout.write', 'cash.open']).map((permission) => ({ permission })),
      }),
    },
    idempotencyReceipt,
    checkSettlement: { findFirst: jest.fn().mockResolvedValue({ id: 'settlement-1', shopId: 'shop-1', currency: 'PLN' }) },
    payment: { findFirst: jest.fn().mockResolvedValue(options.payment ?? null) },
  };
  const operations: any = { pause: jest.fn(), resume: jest.fn() };
  const checkout: any = {
    createPayment: jest.fn().mockResolvedValue({
      settlementId: 'settlement-1', guestCheckId: 'check-1', guestCheckVersion: 8,
      state: 'PAID', currency: 'PLN', total: '25.0000', paidAmount: '25.0000', amountDue: '0.0000', payments: [],
    }),
    getPaymentState: jest.fn().mockResolvedValue({
      settlementId: 'settlement-1', guestCheckId: 'check-1', guestCheckVersion: 8,
      state: 'PAID', currency: 'PLN', total: '25.0000', paidAmount: '25.0000', amountDue: '0.0000', payments: [],
    }),
  };
  return { service: new EdgeContinuityService(prisma, operations, checkout), prisma, operations, checkout, idempotencyReceipt };
}

describe('EdgeContinuityService Phase 12', () => {
  it('rejects client venue mismatch before touching financial state', async () => {
    const f = fixture();
    const dto = cashDto({ venueId: 'shop-2' });
    await expect(f.service.replayExtended('shop-1', 'edge-1', dto)).rejects.toThrow('venue does not match');
    expect(f.checkout.createPayment).not.toHaveBeenCalled();
    expect(f.prisma.membership.findFirst).not.toHaveBeenCalled();
  });

  it('rejects offline cash when the human operator lacks checkout.write', async () => {
    const f = fixture({ permissions: ['checkout.read'], role: 'VIEWER' });
    await expect(f.service.replayExtended('shop-1', 'edge-1', cashDto())).rejects.toThrow('Missing checkout.write');
    expect(f.checkout.createPayment).not.toHaveBeenCalled();
    expect(f.idempotencyReceipt.create).not.toHaveBeenCalled();
  });

  it('replays offline cash through canonical CheckoutPaymentService with stable correlation', async () => {
    const f = fixture();
    const result: any = await f.service.replayExtended('shop-1', 'edge-1', cashDto());
    expect(f.checkout.createPayment).toHaveBeenCalledTimes(1);
    expect(f.checkout.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'cashier-1', shopId: 'shop-1', shopRole: 'CASHIER' }),
      'settlement-1',
      expect.objectContaining({
        expectedCheckVersion: 7,
        method: 'CASH',
        allocationKind: 'CUSTOM',
        allocations: [{ snapshotId: 'snap-1', amount: '25.00' }],
      }),
      'offline:11111111-1111-4111-8111-111111111111',
    );
    expect(result).toMatchObject({ entityId: 'settlement-1', version: 8, status: 'PAID', syncState: 'SYNCED' });
    expect(f.idempotencyReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shopId: 'shop-1', scope: 'offline.edge.cash.v1', status: 'PENDING' }),
    }));
    expect(f.idempotencyReceipt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
  });

  it('recovers a committed cash payment after interrupted acknowledgement without charging again', async () => {
    const pending = {
      shopId: 'shop-1', scope: 'offline.edge.cash.v1', key: 'edge-1:11111111-1111-4111-8111-111111111111',
      requestHash: null, status: 'PENDING', responseJson: null,
    };
    const dto = cashDto();
    const seed = fixture();
    await seed.service.replayExtended('shop-1', 'edge-1', dto);
    pending.requestHash = seed.idempotencyReceipt.create.mock.calls[0][0].data.requestHash;

    const f = fixture({
      receipt: pending,
      payment: { id: 'payment-1', status: 'SUCCESS', correlationId: 'offline:11111111-1111-4111-8111-111111111111' },
    });
    const result: any = await f.service.replayExtended('shop-1', 'edge-1', dto);
    expect(f.checkout.createPayment).not.toHaveBeenCalled();
    expect(f.prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shopId: 'shop-1', settlementId: 'settlement-1', method: 'CASH',
        correlationId: 'offline:11111111-1111-4111-8111-111111111111', status: 'SUCCESS',
      }),
    }));
    expect(f.checkout.getPaymentState).toHaveBeenCalledTimes(1);
    expect(result.recoveredAfterInterruptedAck).toBe(true);
  });

  it('rejects same idempotency identity with different command content', async () => {
    const first = fixture();
    const dto = cashDto();
    await first.service.replayExtended('shop-1', 'edge-1', dto);
    const created = first.idempotencyReceipt.create.mock.calls[0][0].data;
    const f = fixture({ receipt: { ...created, status: 'COMPLETED', responseJson: JSON.stringify({ ok: true }) } });
    const changedPayload = { ...basePayload, amountMinor: 2600, allocations: [{ snapshotId: 'snap-1', amount: '26.00' }] };
    const changed = cashDto({ payload: changedPayload, payloadHash: hash(changedPayload) });
    await expect(f.service.replayExtended('shop-1', 'edge-1', changed)).rejects.toThrow('already used with different content');
    expect(f.checkout.createPayment).not.toHaveBeenCalled();
  });
});
