import type { JwtAccessPayload } from '../auth/auth.service';
import { GuestCheckMergeService } from './guest-check-merge.service';

function actor(): JwtAccessPayload {
  return {
    sub: 'owner-1',
    shopId: 'shop-1',
    shopRole: 'OWNER',
    perms: '*',
  } as JwtAccessPayload;
}

describe('GuestCheckMergeService', () => {
  it('moves every source charge, records lineage, and never posts revenue', async () => {
    const source: any = {
      id: 'source',
      status: 'OPEN',
      version: 3,
      currency: 'PLN',
      currentSettlementId: 'old-source-settlement',
      mergedIntoCheckId: null,
      label: 'Table 1',
      guestName: 'A',
      shopOrders: [{ id: 'order-1' }],
      playSessions: [{ id: 'play-1' }],
      reservations: [{ id: 'reservation-1' }],
    };
    const destination: any = {
      id: 'destination',
      status: 'OPEN',
      version: 8,
      currency: 'PLN',
      currentSettlementId: 'old-destination-settlement',
      mergedIntoCheckId: null,
      label: 'Table 2',
      guestName: 'B',
      shopOrders: [],
      playSessions: [],
      reservations: [],
    };
    const checks = new Map([
      [source.id, source],
      [destination.id, destination],
    ]);
    const transactionCreate = jest.fn();
    const ledgerCreate = jest.fn();
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      guestCheck: {
        findFirst: jest.fn(async ({ where }: any) => checks.get(where.id)),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = checks.get(where.id);
          if (!row || row.version !== where.version || row.status !== 'OPEN') {
            return { count: 0 };
          }
          row.currentSettlementId = data.currentSettlementId;
          row.version += 1;
          if (data.status) row.status = data.status;
          if (data.mergedIntoCheckId) row.mergedIntoCheckId = data.mergedIntoCheckId;
          return { count: 1 };
        }),
      },
      payment: { count: jest.fn().mockResolvedValue(0) },
      shopOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      playSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      reservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      guestCheckMergeEvent: {
        create: jest.fn(async ({ data }: any) => ({
          id: 'merge-1',
          ...data,
          createdAt: new Date('2026-08-10T01:00:00Z'),
        })),
      },
      transaction: { create: transactionCreate },
      ledgerEntry: { create: ledgerCreate },
    };
    const outbox: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new GuestCheckMergeService(
      { $transaction: (fn: any) => fn(tx) } as any,
      { isFeatureEnabled: async () => true } as any,
      outbox,
      audit,
    );

    const result = await service.merge(actor(), destination.id, {
      sourceCheckId: source.id,
      expectedSourceVersion: 3,
      expectedDestinationVersion: 8,
    });

    expect(result.mergeEventId).toBe('merge-1');
    expect(result.movedShopOrderIds).toEqual(['order-1']);
    expect(result.movedPlaySessionIds).toEqual(['play-1']);
    expect(result.movedReservationIds).toEqual(['reservation-1']);
    expect(source.status).toBe('VOID');
    expect(source.mergedIntoCheckId).toBe(destination.id);
    expect(source.version).toBe(4);
    expect(destination.version).toBe(9);
    expect(tx.shopOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.playSession.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.reservation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.guestCheckMergeEvent.create).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
  });

  it('rejects merge when either check already has a successful Chunk 04 payment', async () => {
    const source: any = {
      id: 'source',
      status: 'OPEN',
      version: 1,
      currency: 'PLN',
      currentSettlementId: null,
      mergedIntoCheckId: null,
      label: null,
      guestName: null,
      shopOrders: [],
      playSessions: [],
      reservations: [],
    };
    const destination = { ...source, id: 'destination' };
    const tx: any = {
      $queryRaw: jest.fn(),
      guestCheck: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === source.id ? source : destination,
        ),
      },
      payment: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new GuestCheckMergeService(
      { $transaction: (fn: any) => fn(tx) } as any,
      { isFeatureEnabled: async () => true } as any,
      { enqueue: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      service.merge(actor(), destination.id, {
        sourceCheckId: source.id,
        expectedSourceVersion: 1,
        expectedDestinationVersion: 1,
      }),
    ).rejects.toThrow(/recorded payments/i);
  });

  it('moves only selected sources and invalidates both checkout snapshots', async () => {
    const source: any = {
      id: 'source',
      status: 'OPEN',
      version: 2,
      currency: 'PLN',
      currentSettlementId: 'source-settlement',
      mergedIntoCheckId: null,
      label: null,
      guestName: null,
      shopOrders: [{ id: 'order-1' }, { id: 'order-2' }],
      playSessions: [{ id: 'play-1' }],
      reservations: [],
    };
    const destination: any = {
      id: 'destination',
      status: 'OPEN',
      version: 4,
      currency: 'PLN',
      currentSettlementId: 'destination-settlement',
      mergedIntoCheckId: null,
      label: null,
      guestName: null,
      shopOrders: [],
      playSessions: [],
      reservations: [],
    };
    const checks = new Map([
      [source.id, source],
      [destination.id, destination],
    ]);
    const tx: any = {
      $queryRaw: jest.fn(),
      guestCheck: {
        findFirst: jest.fn(async ({ where }: any) => checks.get(where.id)),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = checks.get(where.id);
          if (row.version !== where.version) return { count: 0 };
          row.version += 1;
          row.currentSettlementId = data.currentSettlementId;
          return { count: 1 };
        }),
      },
      payment: { count: jest.fn().mockResolvedValue(0) },
      shopOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      playSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      reservation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const outbox: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new GuestCheckMergeService(
      { $transaction: (fn: any) => fn(tx) } as any,
      { isFeatureEnabled: async () => true } as any,
      outbox,
      { record: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const result = await service.moveCharges(actor(), source.id, {
      destinationCheckId: destination.id,
      expectedSourceVersion: 2,
      expectedDestinationVersion: 4,
      shopOrderIds: ['order-2'],
    });

    expect(result.shopOrderIds).toEqual(['order-2']);
    expect(tx.shopOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['order-2'] } }),
        data: { guestCheckId: destination.id },
      }),
    );
    expect(source.currentSettlementId).toBeNull();
    expect(destination.currentSettlementId).toBeNull();
    expect(source.version).toBe(3);
    expect(destination.version).toBe(5);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });
});
