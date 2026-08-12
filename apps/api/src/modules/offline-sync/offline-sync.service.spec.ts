import { createHash } from 'crypto';
import type { JwtAccessPayload } from '../auth/auth.service';
import { OfflineSyncService } from './offline-sync.service';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function hash(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const actor = {
  sub: 'owner-1',
  shopId: 'shop-1',
  shopRole: 'OWNER',
  perms: '*',
} as JwtAccessPayload;

const occurredAt = '2026-08-12T12:00:00.000Z';
const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
const pricing: any = { priceLine: jest.fn() };

function service(prisma: any, pricingOverride: any = pricing) {
  return new OfflineSyncService(prisma, flags, pricingOverride);
}

function requestHash(dto: {
  deviceId: string;
  operationType: string;
  entityId: string;
  expectedVersion?: number;
  occurredAt: string;
  payloadHash: string;
}) {
  return hash({
    deviceId: dto.deviceId,
    operationType: dto.operationType,
    entityId: dto.entityId,
    expectedVersion: dto.expectedVersion ?? null,
    occurredAt: dto.occurredAt,
    payloadHash: dto.payloadHash,
  });
}

describe('OfflineSyncService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replays a completed operation receipt without applying the mutation twice', async () => {
    const payload = { label: 'Table 7' };
    const dto = {
      operationId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'browser-a',
      operationType: 'CHECK_CREATE' as const,
      entityId: '11111111-1111-4111-8111-111111111112',
      occurredAt,
      payloadHash: hash(payload),
      payload,
    };
    const response = {
      operationId: dto.operationId,
      deviceId: dto.deviceId,
      operationType: dto.operationType,
      occurredAt,
      syncState: 'SYNCED',
      entityId: dto.entityId,
      version: 1,
      status: 'OPEN',
    };
    const prisma: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash: requestHash(dto),
          status: 'COMPLETED',
          responseJson: JSON.stringify(response),
        }),
      },
      $transaction: jest.fn(),
    };

    await expect(service(prisma).applyOperation(actor, dto)).resolves.toEqual(response);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns a deterministic VERSION_CONFLICT and does not overwrite a newer check', async () => {
    const payload = { label: 'Offline edit' };
    const dto = {
      operationId: '22222222-2222-4222-8222-222222222222',
      deviceId: 'browser-a',
      operationType: 'CHECK_UPDATE' as const,
      entityId: '22222222-2222-4222-8222-222222222223',
      expectedVersion: 4,
      occurredAt,
      payloadHash: hash(payload),
      payload,
    };
    const tx: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({
          id: dto.entityId,
          version: 5,
          status: 'OPEN',
          currentSettlementId: null,
        }),
        updateMany: jest.fn(),
      },
    };
    const prisma: any = {
      idempotencyReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    await expect(service(prisma).applyOperation(actor, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VERSION_CONFLICT' }),
    });
    expect(tx.guestCheck.updateMany).not.toHaveBeenCalled();
  });

  it('creates a client-addressed check and completes one durable receipt transactionally', async () => {
    const payload = { guestName: 'Guest', partySize: 2 };
    const dto = {
      operationId: '33333333-3333-4333-8333-333333333333',
      deviceId: 'browser-a',
      operationType: 'CHECK_CREATE' as const,
      entityId: '33333333-3333-4333-8333-333333333334',
      occurredAt,
      payloadHash: hash(payload),
      payload,
    };
    const receiptUpdate = jest.fn().mockResolvedValue({});
    const tx: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: receiptUpdate,
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: dto.entityId, version: 1, status: 'OPEN' }),
      },
      shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'PLN' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      idempotencyReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    const result = await service(prisma).applyOperation(actor, dto);
    expect(result).toMatchObject({
      operationId: dto.operationId,
      entityId: dto.entityId,
      version: 1,
      syncState: 'SYNCED',
    });
    expect(tx.guestCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ openedAt: new Date(occurredAt) }) }),
    );
    expect(receiptUpdate).toHaveBeenCalledTimes(1);
  });

  it('replays an offline order with server-authoritative pricing and stable order ID', async () => {
    const payload = {
      serviceMode: 'PLAY_SESSION',
      operationsSessionId: 'session-1',
      lines: [{ menuItemId: 'menu-1', quantity: 2 }],
    };
    const dto = {
      operationId: '44444444-4444-4444-8444-444444444444',
      deviceId: 'browser-a',
      operationType: 'ORDER_CREATE' as const,
      entityId: '44444444-4444-4444-8444-444444444445',
      occurredAt,
      payloadHash: hash(payload),
      payload,
    };
    const tx: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      venueOrder: {
        findFirst: jest.fn().mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({ id: dto.entityId, status: 'OPEN', totalMinor: 2200 }),
      },
      operationsSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'ACTIVE',
          guestCheckId: 'check-1',
          resourceId: 'resource-1',
        }),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({ id: 'check-1', status: 'OPEN', currentSettlementId: null }),
      },
      shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'PLN' }) },
      venueOrderLine: { create: jest.fn().mockResolvedValue({ id: 'line-1' }) },
      orderLineModifier: { createMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      idempotencyReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const priceLine = jest.fn().mockResolvedValue({
      menuItemId: 'menu-1', variantId: null, quantity: 2, seat: null,
      nameSnapshot: 'Cola', variantNameSnapshot: null,
      unitBaseMinor: 1000, variantMinor: 0, modifierMinor: 0,
      unitPriceMinor: 1000, subtotalMinor: 2000,
      taxCategorySnapshot: 'VAT10', taxRateBps: 1000, taxMinor: 200,
      totalMinor: 2200, priceSnapshot: {}, modifiers: [],
    });

    const result = await service(prisma, { priceLine }).applyOperation(actor, dto);
    expect(result).toMatchObject({ entityId: dto.entityId, status: 'OPEN', syncState: 'SYNCED' });
    expect(priceLine).toHaveBeenCalledWith('shop-1', expect.objectContaining({ menuItemId: 'menu-1', quantity: 2 }), tx);
    expect(tx.venueOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: dto.entityId, totalMinor: 2200, createdAt: new Date(occurredAt) }) }),
    );
  });

  it('rejects a local session start deterministically when cloud resource state changed', async () => {
    const payload = { resourceId: 'resource-1' };
    const dto = {
      operationId: '55555555-5555-4555-8555-555555555555',
      deviceId: 'browser-a',
      operationType: 'SESSION_START' as const,
      entityId: '55555555-5555-4555-8555-555555555556',
      occurredAt,
      payloadHash: hash(payload),
      payload,
    };
    const tx: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'resource-1',
          status: 'AVAILABLE',
          categoryId: null,
          category: null,
          name: 'Table 1',
          type: 'BILLIARDS',
          hourlyRate: 40,
        }),
      },
      operationsSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cloud-session', status: 'ACTIVE' }),
      },
    };
    const prisma: any = {
      idempotencyReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    await expect(service(prisma).applyOperation(actor, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RESOURCE_CONFLICT' }),
    });
  });
});
