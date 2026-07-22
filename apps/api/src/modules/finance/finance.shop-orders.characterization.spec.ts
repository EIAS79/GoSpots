import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';

/**
 * Bible #11 Phase 3 PREP: characterization tests for shop-order methods
 * still on FinanceService. These lock in current behavior BEFORE any
 * potential extraction. Zero product-behavior changes intended.
 */

jest.mock('../../common/ledger-post.util', () => ({
  postTransactionCreated: jest.fn(),
  postShopLossCreated: jest.fn(),
  postReservationBilled: jest.fn(),
  postShopOrderCompleted: jest.fn().mockResolvedValue('skipped'),
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

jest.mock('../../common/menu-stock-db.util', () => {
  const adjustMenuItemStockBy = jest.fn().mockResolvedValue(true);
  return {
    resetMenuItemStockForDay: jest.fn().mockResolvedValue(undefined),
    fetchMenuItemStockRow: jest.fn().mockResolvedValue({
      id: 'mi_1',
      name: 'Cola',
      stock: 10,
      price: 5,
      trackStock: false,
    }),
    adjustMenuItemStockBy,
    adjustMenuItemStockByOrThrow: jest.fn(
      async (
        prisma: unknown,
        menuItemId: string,
        delta: number,
        shopId?: string,
        message = 'Not enough stock for this item.',
      ) => {
        const ok = await adjustMenuItemStockBy(
          prisma,
          menuItemId,
          delta,
          shopId,
        );
        if (!ok) {
          const { ApiDomainErrorCode } = require('../../common/api-error.codes');
          const { apiConflictException } = require('../../common/api-error.util');
          throw apiConflictException(
            ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT,
            message,
            {
              menuItemId,
              delta,
              ...(shopId ? { shopId } : {}),
            },
          );
        }
      },
    ),
  };
});

jest.mock('../../common/shop-order-stock.util', () => ({
  claimActiveLinesAndRestoreStock: jest.fn().mockResolvedValue(0),
}));

import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { adjustMenuItemStockBy, fetchMenuItemStockRow } from '../../common/menu-stock-db.util';
import { postShopOrderCompleted } from '../../common/ledger-post.util';
import { claimActiveLinesAndRestoreStock } from '../../common/shop-order-stock.util';

describe('FinanceService shop-orders characterization (Phase 3 prep)', () => {
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

  describe('listShopOrders', () => {
    it('scopes findMany by shopId, excludes archived by default, applies status filter', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'ord_1',
          shopId: 'shop_1',
          status: 'PENDING',
          label: null,
          note: null,
          paymentMethod: 'CASH',
          guestCount: 1,
          tableReserved: false,
          reservationFee: null,
          total: 5,
          currency: 'EUR',
          createdAt: new Date('2026-07-22T10:00:00Z'),
          updatedAt: new Date('2026-07-22T10:00:00Z'),
          completedAt: null,
          canceledAt: null,
          archivedAt: null,
          createdById: 'user_1',
          lines: [
            {
              id: 'ln_1',
              name: 'Cola',
              quantity: 1,
              unitPrice: 5,
              lineStatus: 'ACTIVE',
            },
          ],
        },
      ]);
      const prisma = {
        shop: shopWithFeatures(),
        shopOrder: { findMany },
      };
      const svc = makeService(prisma);
      const rows = await svc.listShopOrders(readerActor, {
        status: 'PENDING',
        take: 25,
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop_1',
            status: 'PENDING',
            archivedAt: null,
          }),
          take: 25,
          orderBy: { createdAt: 'desc' },
        }),
      );
      // serializeShopOrder → decimal strings (money wire is 4dp string)
      expect(rows).toHaveLength(1);
      expect(rows[0].total).toBe('5.0000');
      expect(rows[0].reservationFee).toBeNull();
      expect(rows[0].lines[0].unitPrice).toBe('5.0000');
    });

    it('denies missing transaction.read', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(svc.listShopOrders(deniedActor, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('createShopOrder', () => {
    it('creates order scoped to shopId, audits, notifies operations, and serializes money', async () => {
      const createdOrder = {
        id: 'ord_new',
        shopId: 'shop_1',
        status: 'PENDING',
        label: 'Tab 12',
        note: null,
        paymentMethod: 'CASH',
        guestCount: 2,
        tableReserved: false,
        reservationFee: null,
        total: 0,
        currency: 'EUR',
        createdAt: new Date('2026-07-22T10:00:00Z'),
        updatedAt: new Date('2026-07-22T10:00:00Z'),
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        createdById: 'user_1',
        lines: [],
      };
      const create = jest.fn().mockResolvedValue(createdOrder);
      const prisma = {
        shop: shopWithFeatures(),
        shopOrder: { create },
      };
      const svc = makeService(prisma);
      const out = await svc.createShopOrder(actor, {
        label: 'Tab 12',
        guestCount: 2,
      } as never);

      // Currency is stamped from shop and shopId is enforced from actor.
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopId: 'shop_1',
            label: 'Tab 12',
            paymentMethod: 'CASH',
            guestCount: 2,
            tableReserved: false,
            reservationFee: null,
            currency: 'EUR',
            createdById: 'user_1',
          }),
        }),
      );

      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          section: 'finance',
          action: 'finance.shop_order.create',
        }),
      );
      expect(notifications.recordOperationsEvent).toHaveBeenCalledWith(
        'shop_1',
        expect.objectContaining({
          title: 'New menu order',
          dedupeKey: 'shop-order:ord_new',
        }),
      );
      expect(out.id).toBe('ord_new');
      expect(out.total).toBe('0.0000');
      expect(out.reservationFee).toBeNull();
    });

    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.createShopOrder(deniedActor, { label: 'x' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('addShopOrderLine', () => {
    it('happy path adjusts stock and updates order total (untracked stock item)', async () => {
      const existingOrder = {
        id: 'ord_1',
        shopId: 'shop_1',
        status: 'PENDING',
        label: null,
        note: null,
        paymentMethod: 'CASH',
        guestCount: 1,
        tableReserved: false,
        reservationFee: null,
        total: 0,
        currency: 'EUR',
        createdAt: new Date('2026-07-22T10:00:00Z'),
        updatedAt: new Date('2026-07-22T10:00:00Z'),
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        createdById: 'user_1',
        lines: [],
      };
      const updatedOrder = {
        ...existingOrder,
        total: 5,
        lines: [
          {
            id: 'ln_new',
            name: 'Cola',
            quantity: 1,
            unitPrice: 5,
            lineStatus: 'ACTIVE',
          },
        ],
      };

      const shopOrderFindFirst = jest.fn().mockResolvedValue(existingOrder);
      const shopOrderUpdate = jest.fn().mockResolvedValue(updatedOrder);
      const lineCreate = jest.fn().mockResolvedValue({});
      const lineFindMany = jest.fn().mockResolvedValue([
        { quantity: 1, unitPrice: 5 },
      ]);
      const prisma = {
        shop: shopWithFeatures(),
        shopOrder: {
          findFirst: shopOrderFindFirst,
          update: shopOrderUpdate,
        },
        shopOrderLine: {
          create: lineCreate,
          findMany: lineFindMany,
        },
        $transaction: jest.fn(async (fn: (db: unknown) => Promise<unknown>) => {
          const db = {
            shopOrder: { update: shopOrderUpdate },
            shopOrderLine: { create: lineCreate, findMany: lineFindMany },
          };
          return fn(db);
        }),
      };

      const svc = makeService(prisma);
      const out = await svc.addShopOrderLine(actor, 'ord_1', {
        menuItemId: 'mi_1',
        quantity: 1,
      } as never);

      expect(shopOrderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord_1', shopId: 'shop_1' },
        }),
      );
      expect(lineCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopOrderId: 'ord_1',
            menuItemId: 'mi_1',
            name: 'Cola',
            quantity: 1,
            lineStatus: 'ACTIVE',
          }),
        }),
      );
      expect(adjustMenuItemStockBy).toHaveBeenCalledWith(
        expect.anything(),
        'mi_1',
        1,
        'shop_1',
      );
      expect(shopOrderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord_1', shopId: 'shop_1' },
          data: { total: 5 },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'finance.shop_order.line.add',
        }),
      );
      expect(out.total).toBe('5.0000');
      expect(out.lines[0].unitPrice).toBe('5.0000');
    });

    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.addShopOrderLine(deniedActor, 'ord_1', {
          menuItemId: 'mi_1',
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws MENU_STOCK_INSUFFICIENT when tracked item is short (pre-check)', async () => {
      jest.mocked(fetchMenuItemStockRow).mockResolvedValueOnce({
        id: 'mi_1',
        name: 'Cola',
        stock: 0,
        price: 5,
        trackStock: true,
        stockDaily: 0,
        stockResetOn: null,
      });
      const prisma = {
        shop: shopWithFeatures(),
        shopOrder: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ord_1',
            shopId: 'shop_1',
            status: 'PENDING',
            tableReserved: false,
            reservationFee: null,
            lines: [],
          }),
        },
      };
      const svc = makeService(prisma);
      const err = await svc
        .addShopOrderLine(actor, 'ord_1', {
          menuItemId: 'mi_1',
          quantity: 1,
        } as never)
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.response).toMatchObject({
        code: ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT,
        message: 'Cola is out of stock (0 left).',
      });
    });
  });

  describe('updateShopOrder', () => {
    it('status → COMPLETED posts ledger hook, audits complete, notifies handoff', async () => {
      const pendingOrder = {
        id: 'ord_1',
        shopId: 'shop_1',
        status: 'PENDING',
        label: null,
        note: null,
        paymentMethod: 'CASH',
        guestCount: 1,
        tableReserved: false,
        reservationFee: null,
        total: 5,
        currency: 'EUR',
        createdAt: new Date('2026-07-22T10:00:00Z'),
        updatedAt: new Date('2026-07-22T10:00:00Z'),
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        createdById: 'user_1',
        lines: [
          {
            id: 'ln_1',
            name: 'Cola',
            quantity: 1,
            unitPrice: 5,
            lineStatus: 'ACTIVE',
          },
        ],
      };
      const completedOrder = {
        ...pendingOrder,
        status: 'COMPLETED',
        completedAt: new Date('2026-07-22T10:05:00Z'),
      };

      // loadShopOrder returns the pending order (first findFirst).
      // recalcShopOrderTotal calls findFirst({ select: ... }) then update.
      const shopOrderFindFirst = jest
        .fn()
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({ tableReserved: false, reservationFee: null });
      const shopOrderUpdate = jest.fn().mockResolvedValue(completedOrder);
      const lineFindMany = jest
        .fn()
        .mockResolvedValue([{ quantity: 1, unitPrice: 5 }]);

      const prisma = {
        shop: shopWithFeatures(),
        shopOrder: {
          findFirst: shopOrderFindFirst,
          update: shopOrderUpdate,
        },
        shopOrderLine: { findMany: lineFindMany },
      };

      const svc = makeService(prisma);
      const out = await svc.updateShopOrder(actor, 'ord_1', {
        status: 'COMPLETED',
      } as never);

      // ledger hook fired with completed order snapshot
      expect(postShopOrderCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          shopId: 'shop_1',
          orderId: 'ord_1',
          currency: 'EUR',
          createdById: 'user_1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'finance.shop_order.complete',
        }),
      );
      expect(notifications.recordOperationsEvent).toHaveBeenCalledWith(
        'shop_1',
        expect.objectContaining({
          title: 'Order handed off',
          dedupeKey: 'shop-order-complete:ord_1',
        }),
      );
      expect(out.status).toBe('COMPLETED');
      expect(out.total).toBe('5.0000');
    });

    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.updateShopOrder(deniedActor, 'ord_1', {
          status: 'COMPLETED',
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('deleteShopOrder', () => {
    it('scopes deleteMany by shopId, restores active-line stock, and audits delete', async () => {
      const order = {
        id: 'ord_1',
        shopId: 'shop_1',
        status: 'PENDING',
        label: null,
        note: null,
        paymentMethod: 'CASH',
        guestCount: 1,
        tableReserved: false,
        reservationFee: null,
        total: 0,
        currency: 'EUR',
        createdAt: new Date('2026-07-22T10:00:00Z'),
        updatedAt: new Date('2026-07-22T10:00:00Z'),
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        createdById: 'user_1',
        lines: [],
      };
      const shopOrderFindFirst = jest
        .fn()
        .mockResolvedValueOnce(order) // loadShopOrder
        .mockResolvedValueOnce(order); // fresh reload inside txn
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });

      const prisma = {
        shop: shopWithFeatures(),
        shopOrder: { findFirst: shopOrderFindFirst, deleteMany },
        $transaction: jest.fn(async (fn: (db: unknown) => Promise<unknown>) =>
          fn({
            shopOrder: { findFirst: shopOrderFindFirst, deleteMany },
          }),
        ),
      };

      const svc = makeService(prisma);
      const out = await svc.deleteShopOrder(actor, 'ord_1');

      expect(claimActiveLinesAndRestoreStock).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        'ord_1',
        [],
      );
      expect(deleteMany).toHaveBeenCalledWith({
        where: { id: 'ord_1', shopId: 'shop_1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'finance.shop_order.delete',
        }),
      );
      expect(out).toEqual({ ok: true });
    });

    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.deleteShopOrder(deniedActor, 'ord_1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
