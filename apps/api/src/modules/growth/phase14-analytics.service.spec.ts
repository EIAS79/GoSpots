import { BadRequestException } from '@nestjs/common';
import { Phase14AnalyticsService } from './phase14-analytics.service';

const actor = { sub: 'user-1', shopId: 'shop-1' } as any;

function prismaMock() {
  return {
    shop: {
      findUnique: jest.fn().mockResolvedValue({
        slug: 'venue-one',
        branchCode: 'WAW',
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
        businessDayStartMinutes: 240,
      }),
    },
    financialReconciliationIssue: { findMany: jest.fn().mockResolvedValue([]) },
    guestCheck: { findMany: jest.fn().mockResolvedValue([]) },
    domainEventOutbox: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('Phase14AnalyticsService', () => {
  it('derives tenant scope from authenticated shop and resolves overnight business dates', async () => {
    const prisma = prismaMock();
    const service = new Phase14AnalyticsService(prisma, {} as any);

    const context = await (service as any).context(actor, '2026-08-19', '2026-08-19');

    expect(prisma.shop.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'shop-1' } }));
    expect(context.shopId).toBe('shop-1');
    expect(context.from.toISOString()).toBe('2026-08-19T02:00:00.000Z');
    expect(context.to.toISOString()).toBe('2026-08-20T02:00:00.000Z');
  });

  it('accepts the 370-business-date contract and rejects larger ranges', async () => {
    const service = new Phase14AnalyticsService(prismaMock(), {} as any);
    await expect((service as any).context(actor, '2025-08-15', '2026-08-19')).resolves.toEqual(expect.objectContaining({ dayCount: 370 }));
    await expect((service as any).context(actor, '2025-08-14', '2026-08-19')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an empty reconciliation center without manufacturing discrepancies', async () => {
    const prisma = prismaMock();
    const service = new Phase14AnalyticsService(prisma, {} as any);
    const result = await (service as any).reconciliation(
      {
        shopId: 'shop-1', slug: 'venue-one', currency: 'PLN',
        from: new Date('2026-08-19T02:00:00Z'), to: new Date('2026-08-20T02:00:00Z'),
      },
      { currencies: [{ currency: 'PLN', reconciliationVarianceMinor: 0 }] },
      { storedValue: { liabilityByCurrency: { PLN: 0 } } },
      { lowStockRisk: [] },
    );

    expect(result.clear).toBe(true);
    expect(result.issues).toEqual([]);
    expect(prisma.financialReconciliationIssue.findMany.mock.calls[0][0].where.shopId).toBe('shop-1');
    expect(prisma.guestCheck.findMany.mock.calls[0][0].where.shopId).toBe('shop-1');
    expect(prisma.domainEventOutbox.findMany.mock.calls[0][0].where.shopId).toBe('shop-1');
  });

  it('detects deliberate canonical, provider, stored-value, inventory and offline mismatches', async () => {
    const prisma = prismaMock();
    prisma.guestCheck.findMany.mockResolvedValue([{ id: 'check-1', currentSettlementId: null, currentSettlement: null }]);
    prisma.domainEventOutbox.findMany.mockResolvedValue([{
      id: 'event-1', aggregateType: 'EDGE_COMMAND', aggregateId: 'cmd-1', eventType: 'offline.sync',
      status: 'DEAD', lastError: 'conflict', createdAt: new Date('2026-08-19T03:00:00Z'), updatedAt: new Date('2026-08-19T04:00:00Z'),
    }]);
    const service = new Phase14AnalyticsService(prisma, {} as any);
    const result = await (service as any).reconciliation(
      {
        shopId: 'shop-1', slug: 'venue-one', currency: 'PLN',
        from: new Date('2026-08-19T02:00:00Z'), to: new Date('2026-08-20T02:00:00Z'),
      },
      { currencies: [{ currency: 'PLN', reconciliationVarianceMinor: 125 }] },
      { storedValue: { liabilityByCurrency: { PLN: -500 } } },
      { lowStockRisk: [{ stockItemId: 'stock-1', name: 'Milk', quantityMilli: -1000 }] },
    );

    expect(result.clear).toBe(false);
    expect(result.issues.map((row: any) => row.type)).toEqual(expect.arrayContaining([
      'GUEST_CHECK_SETTLEMENT_MISMATCH',
      'PAYMENT_PROVIDER_MISMATCH',
      'STORED_VALUE_LIABILITY_MISMATCH',
      'INVENTORY_ANOMALY',
      'OFFLINE_SYNC_UNRESOLVED',
    ]));
    expect(result.issues.every((row: any) => row.suggestedNextAction)).toBe(true);
    expect(result.issues.every((row: any) => row.firstSeenAt && row.lastCheckedAt)).toBe(true);
  });
});
