import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';

jest.mock('../../common/ledger-post.util', () => ({
  postTransactionCreated: jest.fn().mockResolvedValue('skipped'),
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

jest.mock('../../common/menu-stock-db.util', () => {
  const adjustMenuItemStockBy = jest.fn().mockResolvedValue(true);
  return {
    resetMenuItemStockForDay: jest.fn().mockResolvedValue(undefined),
    fetchMenuItemStockRow: jest.fn().mockResolvedValue({
      id: 'mi_1',
      name: 'Cola',
      stock: 10,
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

import { postTransactionCreated } from '../../common/ledger-post.util';
import { adjustMenuItemStockBy, fetchMenuItemStockRow } from '../../common/menu-stock-db.util';
import { ApiDomainErrorCode } from '../../common/api-error.codes';

describe('FinanceService transactions characterization (Phase 2 split)', () => {
  const audit = { record: jest.fn() };
  const notifications = { recordFinanceEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_1',
    perms: 'transaction.write,transaction.read',
  } as never;

  const deniedActor = {
    sub: 'user_2',
    shopId: 'shop_1',
    perms: '',
  } as never;

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createTransaction SALE adjusts stock and posts ledger hook', async () => {
    const created = {
      id: 'tx_1',
      shopId: 'shop_1',
      kind: 'SALE',
      method: 'CASH',
      amount: 5,
      currency: 'EUR',
      createdAt: new Date('2026-07-22T10:00:00Z'),
      lines: [
        {
          menuItemId: 'mi_1',
          name: 'Cola',
          quantity: 1,
          unitPrice: 5,
          total: 5,
        },
      ],
    };
    const prisma = {
      shop: shopWithFeatures(),
      $transaction: jest.fn(async (fn: (db: unknown) => Promise<unknown>) => {
        const db = {
          transaction: {
            create: jest.fn().mockResolvedValue(created),
          },
        };
        return fn(db);
      }),
    };
    const svc = makeService(prisma);
    const out = await svc.createTransaction(actor, {
      kind: 'SALE',
      lines: [
        {
          menuItemId: 'mi_1',
          name: 'Cola',
          quantity: 1,
          unitPrice: 5,
        },
      ],
    });
    expect(adjustMenuItemStockBy).toHaveBeenCalled();
    expect(postTransactionCreated).toHaveBeenCalled();
    expect(out.amount).toBe('5.0000');
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'finance.transaction.create' }),
    );
  });

  it('createTransaction denies missing write perm', async () => {
    const svc = makeService({ shop: shopWithFeatures() });
    await expect(
      svc.createTransaction(deniedActor, {
        kind: 'SALE',
        lines: [{ name: 'X', quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createTransaction SALE throws MENU_STOCK_INSUFFICIENT when stock is short', async () => {
    jest.mocked(fetchMenuItemStockRow).mockResolvedValueOnce({
      id: 'mi_1',
      name: 'Cola',
      stock: 0,
      trackStock: true,
      stockDaily: 0,
      stockResetOn: null,
    });
    const prisma = {
      shop: shopWithFeatures(),
      $transaction: jest.fn(async (fn: (db: unknown) => Promise<unknown>) => {
        const db = {
          transaction: { create: jest.fn() },
        };
        return fn(db);
      }),
    };
    const svc = makeService(prisma);
    const err = await svc
      .createTransaction(actor, {
        kind: 'SALE',
        lines: [
          {
            menuItemId: 'mi_1',
            name: 'Cola',
            quantity: 1,
            unitPrice: 5,
          },
        ],
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response).toMatchObject({
      code: ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT,
      message: 'Cola is out of stock (0 left).',
    });
  });

  it('listTransactions scopes by shopId', async () => {
    const prisma = {
      shop: shopWithFeatures(),
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx_1',
            amount: 2,
            lines: [{ unitPrice: 2, total: 2 }],
          },
        ]),
      },
    };
    const svc = makeService(prisma);
    const rows = await svc.listTransactions(actor, 10);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_1' },
        take: 10,
      }),
    );
    expect(rows[0].amount).toBe('2.0000');
  });
});
