import { Prisma } from '@prisma/client';
import {
  isLedgerDualWriteEnabled,
  ledgerKindForTransaction,
  postLedgerEntry,
  postShopOrderCompleted,
  postTransactionCreated,
  postWalkInPlaySessionPaid,
  postReservationBilled,
  postShopLossCreated,
} from './ledger-post.util';

describe('ledger-post.util', () => {
  const prev = process.env.LEDGER_DUAL_WRITE;

  afterEach(() => {
    if (prev === undefined) delete process.env.LEDGER_DUAL_WRITE;
    else process.env.LEDGER_DUAL_WRITE = prev;
  });

  describe('isLedgerDualWriteEnabled', () => {
    it('defaults off', () => {
      delete process.env.LEDGER_DUAL_WRITE;
      expect(isLedgerDualWriteEnabled()).toBe(false);
    });
    it('accepts on/true/1', () => {
      process.env.LEDGER_DUAL_WRITE = 'on';
      expect(isLedgerDualWriteEnabled()).toBe(true);
      process.env.LEDGER_DUAL_WRITE = 'TRUE';
      expect(isLedgerDualWriteEnabled()).toBe(true);
      process.env.LEDGER_DUAL_WRITE = '1';
      expect(isLedgerDualWriteEnabled()).toBe(true);
    });
  });

  describe('ledgerKindForTransaction', () => {
    it('maps TransactionKind', () => {
      expect(ledgerKindForTransaction('SALE')).toBe('SALE');
      expect(ledgerKindForTransaction('REFUND')).toBe('REFUND');
      expect(ledgerKindForTransaction('EXPENSE')).toBe('EXPENSE');
      expect(ledgerKindForTransaction('ADJUSTMENT')).toBe('ADJUSTMENT');
    });
  });

  describe('postLedgerEntry', () => {
    it('skips when flag off', async () => {
      delete process.env.LEDGER_DUAL_WRITE;
      const create = jest.fn();
      const result = await postLedgerEntry(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          currency: 'EUR',
          amount: 10,
          kind: 'SALE',
          channel: 'QUICK_SALES',
          sourceType: 'TRANSACTION',
          sourceId: 'tx1',
          occurredAt: new Date(),
        },
      );
      expect(result).toBe('skipped');
      expect(create).not.toHaveBeenCalled();
    });

    it('posts when flag on', async () => {
      process.env.LEDGER_DUAL_WRITE = '1';
      const create = jest.fn().mockResolvedValue({ id: 'le1' });
      const result = await postLedgerEntry(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          currency: 'eur',
          amount: '12.5000',
          kind: 'SALE',
          channel: 'MENU_ORDERS',
          sourceType: 'SHOP_ORDER',
          sourceId: 'o1',
          occurredAt: new Date('2026-07-21T12:00:00Z'),
          createdById: 'u1',
        },
      );
      expect(result).toBe('posted');
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: 's1',
          currency: 'EUR',
          kind: 'SALE',
          channel: 'MENU_ORDERS',
          sourceType: 'SHOP_ORDER',
          sourceId: 'o1',
          createdById: 'u1',
          amount: expect.any(Prisma.Decimal),
        }),
      });
    });

    it('returns duplicate on P2002', async () => {
      process.env.LEDGER_DUAL_WRITE = 'true';
      const err = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      const create = jest.fn().mockRejectedValue(err);
      const result = await postLedgerEntry(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          currency: 'USD',
          amount: 1,
          kind: 'SALE',
          channel: 'QUICK_SALES',
          sourceType: 'TRANSACTION',
          sourceId: 'tx1',
          occurredAt: new Date(),
        },
      );
      expect(result).toBe('duplicate');
    });
  });

  describe('source helpers', () => {
    beforeEach(() => {
      process.env.LEDGER_DUAL_WRITE = '1';
    });

    it('postShopOrderCompleted → MENU_ORDERS SALE', async () => {
      const create = jest.fn().mockResolvedValue({});
      await postShopOrderCompleted(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          orderId: 'o1',
          total: 40,
          currency: 'EUR',
          completedAt: new Date(),
        },
      );
      expect(create.mock.calls[0][0].data).toMatchObject({
        channel: 'MENU_ORDERS',
        sourceType: 'SHOP_ORDER',
        kind: 'SALE',
      });
    });

    it('postTransactionCreated SALE → QUICK_SALES', async () => {
      const create = jest.fn().mockResolvedValue({});
      await postTransactionCreated(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          transactionId: 't1',
          kind: 'SALE',
          amount: 5,
          currency: 'EUR',
          createdAt: new Date(),
        },
      );
      expect(create.mock.calls[0][0].data).toMatchObject({
        channel: 'QUICK_SALES',
        sourceType: 'TRANSACTION',
        kind: 'SALE',
      });
    });

    it('postReservationBilled with resource → PLAY_SESSIONS', async () => {
      const create = jest.fn().mockResolvedValue({});
      await postReservationBilled(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          reservationId: 'r1',
          billedAmount: 20,
          currency: 'EUR',
          billedAt: new Date(),
          resourceId: 'res1',
        },
      );
      expect(create.mock.calls[0][0].data.channel).toBe('PLAY_SESSIONS');
    });

    it('postReservationBilled without resource → RESERVATIONS', async () => {
      const create = jest.fn().mockResolvedValue({});
      await postReservationBilled(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          reservationId: 'r2',
          billedAmount: 15,
          currency: 'EUR',
          billedAt: new Date(),
          resourceId: null,
        },
      );
      expect(create.mock.calls[0][0].data.channel).toBe('RESERVATIONS');
    });

    it('postWalkInPlaySessionPaid skips linked play', async () => {
      const create = jest.fn();
      const result = await postWalkInPlaySessionPaid(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          sessionId: 'ps1',
          amount: 10,
          currency: 'EUR',
          completedAt: new Date(),
          reservationId: 'r1',
        },
      );
      expect(result).toBe('skipped');
      expect(create).not.toHaveBeenCalled();
    });

    it('postShopLossCreated → LOSS null channel', async () => {
      const create = jest.fn().mockResolvedValue({});
      await postShopLossCreated(
        { ledgerEntry: { create } } as never,
        {
          shopId: 's1',
          lossId: 'l1',
          amount: 3,
          currency: 'EUR',
          occurredAt: new Date(),
        },
      );
      expect(create.mock.calls[0][0].data).toMatchObject({
        kind: 'LOSS',
        channel: null,
        sourceType: 'SHOP_LOSS',
      });
    });
  });
});
