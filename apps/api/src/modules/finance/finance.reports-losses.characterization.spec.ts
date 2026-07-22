import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';

jest.mock('./finance-analytics.util', () => ({
  aggregateTopItems: jest.fn(),
  buildFinanceAnalytics: jest.fn(),
}));

jest.mock('../../common/ledger-post.util', () => ({
  postShopLossCreated: jest.fn().mockResolvedValue('skipped'),
  postReservationBilled: jest.fn(),
  postShopOrderCompleted: jest.fn(),
  postTransactionCreated: jest.fn(),
  postWalkInPlaySessionPaid: jest.fn(),
}));

jest.mock('../../common/currency-stamp.util', () => ({
  loadShopCurrency: jest.fn().mockResolvedValue('EUR'),
}));

import {
  aggregateTopItems,
  buildFinanceAnalytics,
} from './finance-analytics.util';
import { postShopLossCreated } from '../../common/ledger-post.util';

describe('FinanceService reports + losses characterization (Phase 1 split)', () => {
  const audit = { record: jest.fn() };
  const notifications = { recordFinanceEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_1',
    perms: 'transaction.read,transaction.write',
    sysRole: 'USER',
    email: 'a@b.c',
  } as never;

  const deniedActor = {
    sub: 'user_2',
    shopId: 'shop_1',
    perms: '',
    sysRole: 'USER',
    email: 'b@b.c',
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

  describe('reports', () => {
    it('salesByItem happy path serializes revenue and audits', async () => {
      (aggregateTopItems as jest.Mock).mockResolvedValue([
        { name: 'Cola', qty: 2, revenue: 4.5 },
      ]);
      const prisma = {
        shop: shopWithFeatures(),
      };
      const svc = makeService(prisma);
      const rows = await svc.salesByItem(actor, 7);
      expect(rows).toEqual([
        { name: 'Cola', qty: 2, revenue: '4.5000' },
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'reports.sales_by_item',
          meta: { days: 7, rowCount: 1 },
        }),
      );
    });

    it('salesByItem denies missing transaction.read', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(svc.salesByItem(deniedActor, 7)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('getFinanceAnalytics delegates to buildFinanceAnalytics', async () => {
      (buildFinanceAnalytics as jest.Mock).mockResolvedValue({
        totalRevenue: '10.0000',
      });
      const svc = makeService({ shop: shopWithFeatures() });
      const out = await svc.getFinanceAnalytics(actor, 14);
      expect(out).toEqual({ totalRevenue: '10.0000' });
      expect(buildFinanceAnalytics).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        14,
      );
    });

    it('getTopSellers denies missing transaction.read', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.getTopSellers(deniedActor, 30, 5),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('losses', () => {
    it('createLoss happy path posts ledger hook, audits, notifies when large', async () => {
      const lossRow = {
        id: 'loss_1',
        shopId: 'shop_1',
        amount: 150,
        currency: 'EUR',
        reason: 'Spill',
        category: 'waste',
        occurredAt: new Date('2026-07-01T12:00:00Z'),
      };
      const prisma = {
        shop: shopWithFeatures(),
        shopLoss: {
          create: jest.fn().mockResolvedValue(lossRow),
        },
      };
      const svc = makeService(prisma);
      const out = await svc.createLoss(actor, {
        amount: 150,
        reason: 'Spill',
        category: 'waste',
      } as never);
      expect(out.amount).toBe('150.0000');
      expect(postShopLossCreated).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lossId: 'loss_1', shopId: 'shop_1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ action: 'finance.loss.create' }),
      );
      expect(notifications.recordFinanceEvent).toHaveBeenCalledWith(
        'shop_1',
        expect.objectContaining({
          title: 'Large loss recorded',
          dedupeKey: 'loss_large_loss_1',
        }),
      );
    });

    it('createLoss denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.createLoss(deniedActor, {
          amount: 10,
          reason: 'x',
          category: 'y',
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('createLoss below threshold skips large-loss notification', async () => {
      const lossRow = {
        id: 'loss_small',
        shopId: 'shop_1',
        amount: 20,
        currency: 'EUR',
        reason: 'Breakage',
        category: 'ops',
        occurredAt: new Date(),
      };
      const prisma = {
        shop: shopWithFeatures(),
        shopLoss: { create: jest.fn().mockResolvedValue(lossRow) },
      };
      const svc = makeService(prisma);
      await svc.createLoss(actor, {
        amount: 20,
        reason: 'Breakage',
        category: 'ops',
      } as never);
      expect(notifications.recordFinanceEvent).not.toHaveBeenCalled();
    });

    it('deleteLoss 404 when missing', async () => {
      const prisma = {
        shop: shopWithFeatures(),
        shopLoss: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const svc = makeService(prisma);
      await expect(svc.deleteLoss(actor, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('listLosses scopes by shopId', async () => {
      const findMany = jest.fn().mockResolvedValue([
        { id: 'l1', amount: 5, shopId: 'shop_1' },
      ]);
      const prisma = {
        shop: shopWithFeatures(),
        shopLoss: { findMany },
      };
      const svc = makeService(prisma);
      const rows = await svc.listLosses(actor, 10);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: 'shop_1' },
          take: 10,
        }),
      );
      expect(rows[0].amount).toBe('5.0000');
    });
  });
});
