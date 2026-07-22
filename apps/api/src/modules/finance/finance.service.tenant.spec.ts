import { NotFoundException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { ShopLossService } from './shop-loss.service';

describe('FinanceService tenant-scoped mutations', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const notifications = {
    recordFinanceEvent: jest.fn(),
    recordOperationsEvent: jest.fn(),
    recordReservationEvent: jest.fn(),
    recordTeamEvent: jest.fn(),
  };

  function makeService(prisma: Record<string, unknown>) {
    const reports = new FinanceReportsService(prisma as never, audit as never);
    const losses = new ShopLossService(
      prisma as never,
      audit as never,
      notifications as never,
    );
    return new FinanceService(
      prisma as never,
      audit as never,
      notifications as never,
      reports,
      losses,
    );
  }

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    perms: 'transaction.write,transaction.read',
  } as never;

  function shopWithTxnFeature() {
    return {
      findUnique: jest.fn().mockResolvedValue({
        subscription: {
          tier: SubscriptionTier.STARTER,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          packId: 'gaming',
          addOnRows: [{ addOnId: 'menu_orders' }],
          staffSeatQuantity: 0,
        },
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deleteShopOrder uses shopId in deleteMany where', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'ord_1',
        shopId: 'shop_a',
        status: 'PENDING',
        lines: [],
        label: null,
        note: null,
        paymentMethod: 'CASH',
        total: 0,
        guestCount: 1,
        tableReserved: false,
        reservationFee: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        createdById: null,
      })
      .mockResolvedValueOnce({
        id: 'ord_1',
        shopId: 'shop_a',
        status: 'PENDING',
        lines: [],
      });
    const shopOrder = { findFirst, deleteMany };
    const prisma = {
      shopOrder,
      shop: shopWithTxnFeature(),
      $transaction: jest.fn(async (fn: (db: unknown) => Promise<unknown>) =>
        fn({ shopOrder }),
      ),
    };
    const svc = makeService(prisma);

    await svc.deleteShopOrder(actor, 'ord_1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'ord_1', shopId: 'shop_a' },
    });
  });

  it('deleteShopOrder rejects cross-tenant order id', async () => {
    const shopOrder = {
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn(),
    };
    const svc = makeService({
      shopOrder,
      shop: shopWithTxnFeature(),
      $transaction: jest.fn(),
    });

    await expect(svc.deleteShopOrder(actor, 'ord_other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(shopOrder.deleteMany).not.toHaveBeenCalled();
  });

  it('cancelPlaySession uses shopId in where', async () => {
    const playSession = {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const svc = makeService({ playSession, shop: shopWithTxnFeature() });

    await svc.cancelPlaySession(actor, 'ps_1');

    expect(playSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ps_1',
        shopId: 'shop_a',
        status: 'ACTIVE',
        completedAt: null,
      },
      data: { status: 'CANCELED', completedAt: null },
    });
    expect(playSession.findFirst).not.toHaveBeenCalled();
  });
});
