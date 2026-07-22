import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';

/**
 * Bible #11 Phase 3 PREP: characterization tests for play-billing methods
 * still on FinanceService. These lock in current behavior BEFORE any
 * potential extraction. Zero product-behavior changes intended.
 */

jest.mock('../../common/ledger-post.util', () => ({
  postTransactionCreated: jest.fn(),
  postShopLossCreated: jest.fn(),
  postReservationBilled: jest.fn(),
  postShopOrderCompleted: jest.fn(),
  postWalkInPlaySessionPaid: jest.fn(),
}));

jest.mock('../../common/currency-stamp.util', () => ({
  loadShopCurrency: jest.fn().mockResolvedValue('EUR'),
}));

jest.mock('../../common/shop-venue-time.util', () => ({
  loadShopVenueTimeContext: jest.fn().mockResolvedValue({
    resolvedTimeZone: 'UTC',
  }),
}));

jest.mock('../../common/menu-stock-db.util', () => ({
  resetMenuItemStockForDay: jest.fn().mockResolvedValue(undefined),
  fetchMenuItemStockRow: jest.fn().mockResolvedValue({
    id: 'mi_1',
    name: 'Cola',
    stock: 10,
  }),
  adjustMenuItemStockBy: jest.fn().mockResolvedValue(true),
}));

describe('FinanceService play-billing characterization (Phase 3 prep)', () => {
  const audit = { record: jest.fn() };
  const notifications = {
    recordFinanceEvent: jest.fn(),
    recordOperationsEvent: jest.fn(),
    recordReservationEvent: jest.fn(),
    recordTeamEvent: jest.fn(),
  };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_1',
    perms: 'transaction.write,transaction.read',
  } as never;

  const readerActor = {
    sub: 'user_reader',
    shopId: 'shop_1',
    perms: 'transaction.read',
  } as never;

  const deniedActor = {
    sub: 'user_2',
    shopId: 'shop_1',
    perms: '',
  } as never;

  function shopWithFeatures() {
    return {
      findUnique: jest.fn().mockResolvedValue({
        subscription: {
          tier: SubscriptionTier.PRO,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          packId: 'gaming',
          addOnRows: [],
          staffSeatQuantity: 0,
        },
      }),
    };
  }

  function proShop() {
    return {
      id: 'shop_1',
      subscription: {
        tier: 'PRO',
        status: 'ACTIVE',
        trialEndsAt: null,
        packId: null,
        staffSeatQuantity: null,
        addOnRows: undefined,
      },
    };
  }

  function unpaidBooking(overrides: Record<string, unknown> = {}) {
    const startsAt = new Date(Date.now() - 90 * 60_000);
    const endsAt = new Date(Date.now() - 30 * 60_000);
    return {
      id: 'res_1',
      shopId: 'shop_1',
      guestName: 'Alex',
      partySize: 1,
      startsAt,
      endsAt,
      status: 'CONFIRMED',
      billedAmount: null,
      billedAt: null,
      billingDiscountPercent: 0,
      billingBaseAmount: null,
      notes: null,
      resourceId: 'res_unit_1',
      resource: {
        id: 'res_unit_1',
        name: 'PC-01',
        type: 'PC',
        hourlyRate: 20,
        category: {
          id: 'cat_1',
          name: 'PC',
          slotMinutes: 60,
          bookingMode: 'TIME',
          offeringConfig: null,
          rates: [],
        },
      },
      ...overrides,
    };
  }

  function makeService(prisma: Record<string, unknown>) {
    const reports = new FinanceReportsService(prisma as never, audit as never);
    const losses = new ShopLossService(
      prisma as never,
      audit as never,
      notifications as never,
    );
    const transactions = new FinanceTransactionService(
      prisma as never,
      audit as never,
    );
    const shopOrders = new ShopOrderService(
      prisma as never,
      audit as never,
      notifications as never,
    );
    const playBilling = new PlayBillingService(
      prisma as never,
      audit as never,
      notifications as never,
    );
    const playSessions = new PlaySessionService(
      prisma as never,
      audit as never,
      notifications as never,
      playBilling,
    );
    return new FinanceService(
      prisma as never,
      audit as never,
      notifications as never,
      reports,
      losses,
      transactions,
      shopOrders,
      playBilling,
      playSessions,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listPlayBilling', () => {
    it('scopes reservation and walk-in findMany by shopId with bounded take', async () => {
      const reservationFindMany = jest
        .fn()
        .mockResolvedValue([unpaidBooking()]);
      const playSessionFindMany = jest.fn().mockResolvedValue([]);
      const reservationCount = jest.fn().mockResolvedValue(1);
      const playSessionCount = jest.fn().mockResolvedValue(0);
      const prisma = {
        shop: shopWithFeatures(),
        reservation: {
          findMany: reservationFindMany,
          count: reservationCount,
        },
        playSession: {
          findMany: playSessionFindMany,
          count: playSessionCount,
        },
      };
      const svc = makeService(prisma);
      const out = await svc.listPlayBilling(readerActor, { pageSize: 10 });

      expect(reservationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                shopId: 'shop_1',
                resourceId: { not: null },
                status: { notIn: ['CANCELED', 'NO_SHOW'] },
              }),
            ]),
          }),
          orderBy: { startsAt: 'desc' },
          take: expect.any(Number),
        }),
      );
      expect(
        reservationFindMany.mock.calls[0][0].take,
      ).toBeGreaterThanOrEqual(10);
      expect(playSessionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                shopId: 'shop_1',
                reservationId: null,
                status: { not: 'CANCELED' },
                archivedAt: null,
              }),
            ]),
          }),
          orderBy: { startedAt: 'desc' },
          take: expect.any(Number),
        }),
      );
      expect(reservationCount).toHaveBeenCalled();
      expect(playSessionCount).toHaveBeenCalled();
      expect(out.items).toHaveLength(1);
      expect(out.items[0].id).toBe('res_1');
      expect(out.items[0].source).toBe('booking');
      expect(out.items[0].amountDue).toMatch(/^\d+\.\d{4}$/);
      expect(out.total).toBe(1);
      expect(out.page).toBe(1);
      expect(out.pageSize).toBe(10);
    });

    it('defaults to a 30-day window when from/to omitted (non in-progress tab)', async () => {
      const reservationFindMany = jest.fn().mockResolvedValue([]);
      const playSessionFindMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        shop: shopWithFeatures(),
        reservation: {
          findMany: reservationFindMany,
          count: jest.fn().mockResolvedValue(0),
        },
        playSession: {
          findMany: playSessionFindMany,
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const svc = makeService(prisma);
      await svc.listPlayBilling(readerActor, {
        tab: 'awaiting_payment',
        pageSize: 10,
      });

      const reservationWhere = reservationFindMany.mock.calls[0][0].where;
      const baseClause = reservationWhere.AND[0];
      expect(baseClause.startsAt.gte).toBeInstanceOf(Date);
      expect(baseClause.startsAt.lte).toBeInstanceOf(Date);
    });
  });

  describe('markPlayBillingPaid', () => {
    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.markPlayBillingPaid(deniedActor, 'res_1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('conflicts when unpaid claim count is 0', async () => {
      const row = unpaidBooking();
      const svc = makeService({
        shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            reservation: {
              findFirst: jest.fn().mockResolvedValue(row),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          }),
        ),
      });

      await expect(
        svc.markPlayBillingPaid(actor, 'res_1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 when booking missing', async () => {
      const svc = makeService({
        shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            reservation: {
              findFirst: jest.fn().mockResolvedValue(null),
              updateMany: jest.fn(),
            },
          }),
        ),
      });

      await expect(
        svc.markPlayBillingPaid(actor, 'missing', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updatePlayBilling', () => {
    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.updatePlayBilling(deniedActor, 'res_1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cancelPlayBilling', () => {
    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.cancelPlayBilling(deniedActor, 'res_1', { reason: 'CANCELED' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
