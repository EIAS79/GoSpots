import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';

/**
 * Bible #11 Phase 3 PREP: characterization tests for play-session methods
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

describe('FinanceService play-session characterization (Phase 3 prep)', () => {
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

  describe('listPlaySessions', () => {
    it('scopes findMany by shopId, excludes archived by default, applies status filter', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'ps_1',
          shopId: 'shop_1',
          status: 'ACTIVE',
          amount: 20,
          currency: 'EUR',
          label: 'Table 1',
          note: null,
          playerCount: 1,
          startedAt: new Date('2026-07-22T10:00:00Z'),
          endedAt: null,
          durationMinutes: 60,
          completedAt: null,
          archivedAt: null,
          resource: null,
          reservation: null,
        },
      ]);
      const prisma = {
        shop: shopWithFeatures(),
        playSession: { findMany },
      };
      const svc = makeService(prisma);
      const rows = await svc.listPlaySessions(readerActor, {
        status: 'ACTIVE',
        take: 25,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop_1',
            status: 'ACTIVE',
            archivedAt: null,
          }),
          take: 25,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe('20.0000');
    });

    it('denies missing transaction.read', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.listPlaySessions(deniedActor, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createPlaySession', () => {
    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.createPlaySession(deniedActor, { label: 'Walk-in' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('markPlaySessionPaid', () => {
    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.markPlaySessionPaid(deniedActor, 'ps_1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cancelPlaySession', () => {
    it('uses conditional ACTIVE + unpaid claim', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const prisma = {
        shop: shopWithFeatures(),
        playSession: { updateMany },
      };
      const svc = makeService(prisma);

      await expect(svc.cancelPlaySession(actor, 'ps_1')).resolves.toEqual({
        ok: true,
        sessionId: 'ps_1',
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ps_1',
          shopId: 'shop_1',
          status: 'ACTIVE',
          completedAt: null,
        },
        data: { status: 'CANCELED', completedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'finance.play_session.cancel',
        }),
      );
    });

    it('denies missing transaction.write', async () => {
      const svc = makeService({ shop: shopWithFeatures() });
      await expect(
        svc.cancelPlaySession(deniedActor, 'ps_1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
