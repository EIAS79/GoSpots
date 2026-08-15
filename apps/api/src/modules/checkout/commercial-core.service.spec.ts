import {
  CommercialAdjustmentScope,
  CommercialAdjustmentSource,
  CommercialAdjustmentType,
  Prisma,
} from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CommercialCoreService } from './commercial-core.service';

function actor(overrides: Partial<JwtAccessPayload> = {}): JwtAccessPayload {
  return {
    sub: 'owner-1',
    shopId: 'shop-1',
    shopRole: 'OWNER',
    perms: '*',
    ...overrides,
  } as JwtAccessPayload;
}

function projection(total = '100.0000') {
  return {
    checkId: 'check-1',
    checkVersion: 4,
    sourceHash: 'hash',
    currency: 'PLN',
    subtotal: new Prisma.Decimal(total),
    adjustments: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    depositAmount: new Prisma.Decimal(0),
    total: new Prisma.Decimal(total),
    amountDue: new Prisma.Decimal(total),
    lines: [
      {
        position: 0,
        sourceType: 'SHOP_ORDER' as const,
        sourceId: 'order-1',
        lineReference: 'line-1',
        description: 'Item',
        quantity: 1,
        unitAmount: new Prisma.Decimal(total),
        grossAmount: new Prisma.Decimal(total),
        discountAmount: new Prisma.Decimal(0),
        finalAmount: new Prisma.Decimal(total),
        currency: 'PLN',
        pricingMetadata: {},
      },
    ],
    billReady: true,
    blockers: [],
    commercial: {
      discountAmount: new Prisma.Decimal(0),
      serviceChargeAmount: new Prisma.Decimal(0),
      tipAmount: new Prisma.Decimal(0),
      operationsSessionAmount: new Prisma.Decimal(0),
      venueOrderAmount: new Prisma.Decimal(0),
    },
  };
}

describe('CommercialCoreService', () => {
  it('rejects a percentage discount above the venue ceiling before mutation', async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'check-1',
          shopId: 'shop-1',
          status: 'OPEN',
          version: 4,
          currentSettlementId: null,
        }),
      },
      commercialPolicy: {
        upsert: jest.fn().mockResolvedValue({
          maxManualDiscountBps: 1000,
          maxCompAmountMinor: 5000,
          maxPriceOverrideBps: 2000,
        }),
      },
      commercialAdjustment: {
        create: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const settlement: any = {
      buildProjection: jest
        .fn()
        .mockResolvedValue({ check: {}, projection: projection() }),
    };
    const service = new CommercialCoreService(
      prisma,
      settlement,
      { enqueue: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      service.applyAdjustment(actor(), 'check-1', {
        expectedCheckVersion: 4,
        type: CommercialAdjustmentType.PERCENTAGE_DISCOUNT,
        scope: CommercialAdjustmentScope.CHECK,
        source: CommercialAdjustmentSource.MANUAL,
        percentageBps: 1500,
        reason: 'Supervisor request',
      }),
    ).rejects.toThrow(/exceeds venue maximum/i);
    expect(tx.commercialAdjustment.create).not.toHaveBeenCalled();
  });

  it('rejects a stale GuestCheck version before applying an adjustment', async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'check-1',
          shopId: 'shop-1',
          status: 'OPEN',
          version: 9,
          currentSettlementId: null,
        }),
      },
      commercialPolicy: { upsert: jest.fn() },
      commercialAdjustment: { create: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new CommercialCoreService(
      prisma,
      { buildProjection: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      service.applyAdjustment(actor(), 'check-1', {
        expectedCheckVersion: 8,
        type: CommercialAdjustmentType.FIXED_DISCOUNT,
        amountMinor: 100,
        reason: 'Guest recovery',
      }),
    ).rejects.toThrow(/version/i);
    expect(tx.commercialAdjustment.create).not.toHaveBeenCalled();
  });

  it('records but refuses destructive reopen after successful payment', async () => {
    const reopenCreate = jest.fn().mockResolvedValue({ id: 'reopen-1' });
    const updateCheck = jest.fn();
    const tx: any = {
      $queryRaw: jest.fn(),
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'check-1',
          shopId: 'shop-1',
          status: 'SETTLED',
          version: 6,
        }),
        update: updateCheck,
      },
      checkSettlement: {
        findFirst: jest.fn().mockResolvedValue({ id: 'settlement-1' }),
      },
      payment: { count: jest.fn().mockResolvedValue(1) },
      ledgerEntry: { count: jest.fn().mockResolvedValue(2) },
      guestCheckReopenEvent: { create: reopenCreate },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new CommercialCoreService(
      prisma,
      {} as any,
      { enqueue: jest.fn() } as any,
      audit,
    );

    await expect(
      service.reopen(actor(), 'check-1', {
        expectedCheckVersion: 6,
        reason: 'Guest disputes paid bill',
      }),
    ).rejects.toThrow(/refund\/re-sale/i);
    expect(reopenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disposition: 'REFUND_RESALE_REQUIRED',
          reason: 'Guest disputes paid bill',
        }),
      }),
    );
    expect(updateCheck).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });
});
