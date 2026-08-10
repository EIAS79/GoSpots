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

describe('OfflineSyncService', () => {
  it('replays a completed operation receipt without applying the mutation twice', async () => {
    const payload = { label: 'Table 7' };
    const dto = {
      operationId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'browser-a',
      operationType: 'CHECK_CREATE' as const,
      entityId: 'local-check-1',
      payloadHash: hash(payload),
      payload,
    };
    const requestHash = hash({
      deviceId: dto.deviceId,
      operationType: dto.operationType,
      entityId: dto.entityId,
      expectedVersion: null,
      payloadHash: dto.payloadHash,
    });
    const response = {
      operationId: dto.operationId,
      deviceId: dto.deviceId,
      operationType: dto.operationType,
      syncState: 'SYNCED',
      entityId: dto.entityId,
      version: 1,
      status: 'OPEN',
    };
    const prisma: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash,
          status: 'COMPLETED',
          responseJson: JSON.stringify(response),
        }),
      },
      $transaction: jest.fn(),
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new OfflineSyncService(prisma, flags);

    await expect(service.applyOperation(actor, dto)).resolves.toEqual(response);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns a deterministic VERSION_CONFLICT and does not overwrite a newer check', async () => {
    const payload = { label: 'Offline edit' };
    const dto = {
      operationId: '22222222-2222-4222-8222-222222222222',
      deviceId: 'browser-a',
      operationType: 'CHECK_UPDATE' as const,
      entityId: 'check-1',
      expectedVersion: 4,
      payloadHash: hash(payload),
      payload,
    };
    const tx: any = {
      idempotencyReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({ id: 'check-1', version: 5, status: 'OPEN' }),
        updateMany: jest.fn(),
      },
    };
    const prisma: any = {
      idempotencyReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new OfflineSyncService(prisma, flags);

    await expect(service.applyOperation(actor, dto)).rejects.toMatchObject({
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
      entityId: 'local-check-3',
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
    };
    const prisma: any = {
      idempotencyReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new OfflineSyncService(prisma, flags);

    const result = await service.applyOperation(actor, dto);
    expect(result).toMatchObject({
      operationId: dto.operationId,
      entityId: dto.entityId,
      version: 1,
      syncState: 'SYNCED',
    });
    expect(tx.guestCheck.create).toHaveBeenCalledTimes(1);
    expect(receiptUpdate).toHaveBeenCalledTimes(1);
  });
});
