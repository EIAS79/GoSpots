import { BadRequestException } from '@nestjs/common';
import { GrowthAnalyticsService } from './growth-analytics.service';

const actor = { sub: 'user-1', shopId: 'shop-1' } as any;
const money = (value: string) => ({ toString: () => value });

function basePrisma() {
  return {
    shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'EUR' }) },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    refund: { findMany: jest.fn().mockResolvedValue([]) },
    pricingSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    tipLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
    timePunch: { findMany: jest.fn().mockResolvedValue([]) },
    breakRecord: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('GrowthAnalyticsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reconciles ledger truth against successful provider payments/refunds by currency', async () => {
    const prisma = basePrisma();
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { kind: 'SALE', currency: 'EUR', amount: money('10.00') },
      { kind: 'REFUND', currency: 'EUR', amount: money('2.00') },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      { currency: 'EUR', amount: money('10.00') },
    ]);
    prisma.refund.findMany.mockResolvedValue([
      { currency: 'EUR', amount: money('2.00') },
    ]);
    prisma.pricingSnapshot.findMany.mockResolvedValue([
      {
        id: 'snap-old',
        sourceType: 'CHECK',
        sourceId: 'check-1',
        currency: 'EUR',
        discountMinor: 50,
      },
      {
        id: 'snap-new',
        sourceType: 'CHECK',
        sourceId: 'check-1',
        currency: 'EUR',
        discountMinor: 30,
      },
    ]);
    prisma.tipLedgerEntry.findMany.mockResolvedValue([
      { currency: 'EUR', amountMinor: 100 },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { kind: 'SALE_CONSUMPTION', totalCostMinor: 100 },
      { kind: 'SALE_REVERSAL', totalCostMinor: 20 },
    ]);
    const service = new GrowthAnalyticsService(prisma);
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-09-01T00:00:00Z');

    const result = await service.finance(actor, from, to);

    expect(result.sourceOfTruth).toBe('LedgerEntry');
    expect(result.reconciliation.ok).toBe(true);
    expect(result.latestPricingSnapshotCount).toBe(1);
    expect(result.currencies).toEqual([
      expect.objectContaining({
        currency: 'EUR',
        ledgerGrossMinor: 1000,
        ledgerRefundMinor: 200,
        netSettledRevenueMinor: 800,
        providerGrossMinor: 1000,
        providerRefundMinor: 200,
        providerNetMinor: 800,
        reconciliationVarianceMinor: 0,
        reconciliationOk: true,
        discountMinor: 30,
        tipMinor: 100,
        cogsMinor: 80,
        laborCostMinor: 0,
        contributionMinor: 720,
      }),
    ]);
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: 'shop-1',
          occurredAt: { gte: from, lt: to },
        },
      }),
    );
  });

  it('surfaces reconciliation variance instead of masking provider drift', async () => {
    const prisma = basePrisma();
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { kind: 'SALE', currency: 'EUR', amount: money('10.00') },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      { currency: 'EUR', amount: money('9.00') },
    ]);
    const service = new GrowthAnalyticsService(prisma);

    const result = await service.finance(
      actor,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-02T00:00:00Z'),
    );

    expect(result.reconciliation.ok).toBe(false);
    expect(result.reconciliation.byCurrency.EUR).toBe(100);
  });

  it('rejects empty, reversed, and invalid reporting windows', async () => {
    const service = new GrowthAnalyticsService(basePrisma());
    const at = new Date('2026-08-11T00:00:00Z');

    await expect(service.finance(actor, at, at)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.finance(actor, new Date('invalid'), new Date('2026-08-12T00:00:00Z')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rebuilds the three semantic range facts deterministically at the same bucket', async () => {
    const tx: any = {
      analyticsFact: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'fact-finance' })
          .mockResolvedValueOnce({ id: 'fact-operations' })
          .mockResolvedValueOnce({ id: 'fact-guests' }),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
        create: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new GrowthAnalyticsService(prisma);
    jest.spyOn(service, 'finance').mockResolvedValue({
      currencies: [{ currency: 'EUR' }],
      reconciliation: { ok: true },
    } as any);
    jest.spyOn(service, 'operations').mockResolvedValue({
      resources: { utilizationPct: 50 },
    } as any);
    jest.spyOn(service, 'guests').mockResolvedValue({
      repeatVisits: { ratePct: 25 },
    } as any);
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-02T00:00:00Z');

    const result = await service.rebuildFacts(actor, from, to);

    expect(tx.analyticsFact.findFirst).toHaveBeenCalledTimes(3);
    expect(tx.analyticsFact.update).toHaveBeenCalledTimes(3);
    expect(tx.analyticsFact.create).not.toHaveBeenCalled();
    expect(result.facts).toHaveLength(3);
    expect(
      tx.analyticsFact.findFirst.mock.calls.map((call: any[]) => call[0].where.factKind),
    ).toEqual(['RANGE_FINANCE', 'RANGE_OPERATIONS', 'RANGE_GUESTS']);
    expect(
      tx.analyticsFact.findFirst.mock.calls.map((call: any[]) => ({
        start: call[0].where.bucketStart,
        end: call[0].where.bucketEnd,
      })),
    ).toEqual([
      { start: from, end: to },
      { start: from, end: to },
      { start: from, end: to },
    ]);
  });
});
