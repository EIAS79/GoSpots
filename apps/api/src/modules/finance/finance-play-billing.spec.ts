import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { ShopLossService } from './shop-loss.service';

describe('FinanceService markPlayBillingPaid races', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('claims unpaid→paid in one transaction with amount stamp', async () => {
    const row = unpaidBooking();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        billedAt: new Date(),
        billedAmount: 20,
        status: 'COMPLETED',
      });

    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          reservation: { findFirst, updateMany },
        }),
      ),
    });

    const mapped = await svc.markPlayBillingPaid(actor, 'res_1', {});
    expect(mapped?.isPaid).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'res_1',
          shopId: 'shop_1',
          resourceId: { not: null },
          billedAt: null,
          status: { notIn: ['CANCELED', 'NO_SHOW'] },
        },
        data: expect.objectContaining({
          billedAmount: expect.any(Number),
          billedAt: expect.any(Date),
          status: 'COMPLETED',
        }),
      }),
    );
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

  it('stamps amountOverride on the unpaid claim', async () => {
    const row = unpaidBooking();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        billedAt: new Date(),
        billedAmount: 42.5,
        status: 'COMPLETED',
      });

    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          reservation: { findFirst, updateMany },
        }),
      ),
    });

    await svc.markPlayBillingPaid(actor, 'res_1', { amountOverride: 42.5 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billedAmount: 42.5,
          billedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('404 when resource missing on row', async () => {
    const row = unpaidBooking({ resource: null, resourceId: 'gone' });
    const svc = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue(proShop()) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          reservation: {
            findFirst: jest.fn().mockResolvedValue(row),
            updateMany: jest.fn(),
          },
        }),
      ),
    });

    await expect(
      svc.markPlayBillingPaid(actor, 'res_1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
