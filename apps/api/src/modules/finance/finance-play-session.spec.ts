import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { ShopLossService } from './shop-loss.service';

describe('FinanceService walk-in pay/cancel races', () => {
  const actor = {
    sub: 'user_1',
    shopId: 'shop_1',
    perms: '*',
  } as never;

  const audit = { record: jest.fn() };
  const notifications = { recordFinanceEvent: jest.fn() };

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancelPlaySession uses conditional ACTIVE + unpaid claim', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      playSession: { updateMany },
    });

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
  });

  it('cancelPlaySession rejects paid when claim misses', async () => {
    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      playSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ps_1',
          status: 'ACTIVE',
          completedAt: new Date(),
        }),
      },
    });

    await expect(svc.cancelPlaySession(actor, 'ps_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('markPlaySessionPaid claims in one transaction', async () => {
    const startedAt = new Date(Date.now() - 60_000);
    const endedAt = new Date(Date.now() - 1_000);
    const row = {
      id: 'ps_1',
      shopId: 'shop_1',
      reservationId: null,
      status: 'ACTIVE',
      amount: 20,
      billingDiscountPercent: 0,
      paymentMethod: 'CASH',
      label: 'Table 1',
      note: null,
      playerCount: 1,
      startedAt,
      endedAt,
      durationMinutes: 60,
      completedAt: null,
      resource: null,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, completedAt: new Date(), amount: 20 });

    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          playSession: { findFirst, updateMany },
        }),
      ),
      playSession: { findFirst, updateMany },
    });

    const mapped = await svc.markPlaySessionPaid(actor, 'ps_1', {});
    expect(mapped?.isPaid).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ps_1',
          shopId: 'shop_1',
          reservationId: null,
          status: { not: 'CANCELED' },
        },
      }),
    );
  });

  it('markPlaySessionPaid conflicts when claim count is 0', async () => {
    const startedAt = new Date(Date.now() - 60_000);
    const endedAt = new Date(Date.now() - 1_000);
    const row = {
      id: 'ps_1',
      shopId: 'shop_1',
      reservationId: null,
      status: 'ACTIVE',
      amount: 20,
      billingDiscountPercent: 0,
      paymentMethod: 'CASH',
      label: 'Table 1',
      note: null,
      playerCount: 1,
      startedAt,
      endedAt,
      durationMinutes: 60,
      completedAt: null,
      resource: null,
    };

    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          playSession: {
            findFirst: jest.fn().mockResolvedValue(row),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        }),
      ),
    });

    await expect(
      svc.markPlaySessionPaid(actor, 'ps_1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('markPlaySessionPaid 404 when missing', async () => {
    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          playSession: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn(),
          },
        }),
      ),
    });

    await expect(
      svc.markPlaySessionPaid(actor, 'missing', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
