import { Prisma } from '@prisma/client';
import { backfillLedgerForShop } from './ledger-backfill.util';

describe('ledger-backfill.util', () => {
  const shopId = 'shop_1';

  it('force-posts eligible sources when dual-write flag is off', async () => {
    delete process.env.LEDGER_DUAL_WRITE;
    const create = jest.fn().mockResolvedValue({ id: 'le' });
    const db = {
      shopOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ord_1',
            total: new Prisma.Decimal('10.0000'),
            currency: 'EUR',
            completedAt: new Date('2026-07-01T12:00:00Z'),
            createdById: 'u1',
          },
        ]),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx_1',
            kind: 'SALE',
            amount: new Prisma.Decimal('5.0000'),
            currency: 'EUR',
            createdAt: new Date('2026-07-01T13:00:00Z'),
            createdById: null,
          },
        ]),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'res_1',
            billedAmount: new Prisma.Decimal('20.0000'),
            billedAt: new Date('2026-07-01T14:00:00Z'),
            resourceId: 'unit_1',
            currency: 'EUR',
          },
        ]),
      },
      playSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'play_linked',
            amount: new Prisma.Decimal('99.0000'),
            currency: 'EUR',
            completedAt: new Date('2026-07-01T15:00:00Z'),
            updatedAt: new Date('2026-07-01T15:00:00Z'),
            status: 'COMPLETED',
            reservationId: 'res_1',
            createdById: null,
          },
          {
            id: 'play_walk',
            amount: new Prisma.Decimal('8.0000'),
            currency: 'EUR',
            completedAt: new Date('2026-07-01T16:00:00Z'),
            updatedAt: new Date('2026-07-01T16:00:00Z'),
            status: 'COMPLETED',
            reservationId: null,
            createdById: null,
          },
        ]),
      },
      shopLoss: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'loss_1',
            amount: new Prisma.Decimal('1.0000'),
            currency: 'EUR',
            occurredAt: new Date('2026-07-01T17:00:00Z'),
            createdById: null,
          },
        ]),
      },
      ledgerEntry: { create },
    };

    // Linked play must be filtered by query (reservationId: null) — simulate empty linked
    db.playSession.findMany = jest.fn().mockResolvedValue([
      {
        id: 'play_walk',
        amount: new Prisma.Decimal('8.0000'),
        currency: 'EUR',
        completedAt: new Date('2026-07-01T16:00:00Z'),
        updatedAt: new Date('2026-07-01T16:00:00Z'),
        status: 'COMPLETED',
        reservationId: null,
        createdById: null,
      },
    ]);

    const counts = await backfillLedgerForShop(db as never, shopId, 'EUR');
    expect(counts.posted).toBe(5); // order + tx + res + walk-in + loss
    expect(counts.bySource.shopOrders).toBe(1);
    expect(counts.bySource.transactions).toBe(1);
    expect(counts.bySource.reservations).toBe(1);
    expect(counts.bySource.playSessions).toBe(1);
    expect(counts.bySource.shopLosses).toBe(1);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it('dry-run counts candidates without writing', async () => {
    const create = jest.fn();
    const db = {
      shopOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ord_1',
            total: new Prisma.Decimal('10.0000'),
            currency: 'EUR',
            completedAt: new Date(),
            createdById: null,
          },
        ]),
      },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
      playSession: { findMany: jest.fn().mockResolvedValue([]) },
      shopLoss: { findMany: jest.fn().mockResolvedValue([]) },
      ledgerEntry: { create },
    };
    const counts = await backfillLedgerForShop(db as never, shopId, 'EUR', {
      dryRun: true,
    });
    expect(counts.posted).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });
});
