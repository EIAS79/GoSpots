import { GrowthPricingService } from './growth-pricing.service';

const actor = { sub: 'user-1', shopId: 'shop-1' } as any;

function makeService(prismaOverrides: Record<string, any> = {}) {
  const prisma: any = {
    shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'EUR' }) },
    promotionRule: { findMany: jest.fn().mockResolvedValue([]) },
    ruleCondition: { findMany: jest.fn().mockResolvedValue([]) },
    ruleBenefit: { findMany: jest.fn().mockResolvedValue([]) },
    packageDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    guestCheck: { findFirst: jest.fn() },
    payment: { findFirst: jest.fn() },
    tipLedgerEntry: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new GrowthPricingService(prisma, audit), prisma, audit };
}

describe('GrowthPricingService reconciliation gates', () => {
  it('includes package direct cost in quote profitability evidence', async () => {
    const pack = {
      id: 'package-1',
      shopId: 'shop-1',
      name: 'Party pack',
      priceMinor: 5000,
      currency: 'EUR',
      active: true,
      components: [
        { quantity: 2, costMinor: 400 },
        { quantity: 1, costMinor: 250 },
      ],
    };
    const { service } = makeService({
      packageDefinition: { findMany: jest.fn().mockResolvedValue([pack]) },
    });

    const quote = await service.quote(actor, {
      subtotalMinor: 10000,
      packageIds: ['package-1'],
    });

    expect(quote.subtotalMinor).toBe(15000);
    expect(quote.packageMinor).toBe(5000);
    expect(quote.packageCostMinor).toBe(1050);
    expect(quote.contributionBeforeOtherCostsMinor).toBe(13950);
    expect(quote.packages).toEqual([
      expect.objectContaining({
        id: 'package-1',
        priceMinor: 5000,
        estimatedCostMinor: 1050,
      }),
    ]);
  });

  it('writes tip refunds as negative append-only movements tied to payment evidence', async () => {
    const persisted = {
      id: 'tip-refund-1',
      guestCheckId: 'check-1',
      paymentId: 'payment-1',
      type: 'REFUND',
      amountMinor: -300,
      currency: 'EUR',
    };
    const upsert = jest.fn().mockResolvedValue(persisted);
    const { service, prisma } = makeService({
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({ id: 'check-1', status: 'SETTLED' }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', status: 'SUCCESS' }),
      },
      tipLedgerEntry: { upsert, findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.recordTip(actor, {
      guestCheckId: 'check-1',
      paymentId: 'payment-1',
      type: 'REFUND',
      amountMinor: 300,
      correlationId: 'tip-refund-correlation',
      reason: 'Refunded settlement',
    });

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: 'payment-1', shopId: 'shop-1', status: 'SUCCESS' },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_correlationId: {
            shopId: 'shop-1',
            correlationId: 'tip-refund-correlation',
          },
        },
        create: expect.objectContaining({
          type: 'REFUND',
          amountMinor: -300,
          paymentId: 'payment-1',
        }),
      }),
    );
    expect(result.amountMinor).toBe(-300);
  });

  it('preserves the sign of explicit reversal entries', async () => {
    const upsert = jest.fn().mockImplementation(async ({ create }: any) => ({
      id: 'tip-reversal-1',
      ...create,
    }));
    const { service } = makeService({
      guestCheck: { findFirst: jest.fn().mockResolvedValue({ id: 'check-1' }) },
      tipLedgerEntry: { upsert, findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.recordTip(actor, {
      guestCheckId: 'check-1',
      type: 'REVERSAL',
      amountMinor: -200,
      correlationId: 'tip-reversal-correlation',
      reason: 'Correct prior gratuity',
    });

    expect(result.amountMinor).toBe(-200);
  });

  it('reconciles positive tips and negative refunds in the report totals', async () => {
    const { service } = makeService({
      tipLedgerEntry: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { amountMinor: 1000, paymentId: 'payment-1' },
          { amountMinor: -250, paymentId: 'payment-1' },
          { amountMinor: 300, paymentId: null },
        ]),
      },
    });

    const report = await service.tipReport(
      actor,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-02T00:00:00Z'),
    );

    expect(report.totalMinor).toBe(1050);
    expect(report.cardMinor).toBe(750);
    expect(report.cashMinor).toBe(300);
    expect(report.payoutReadyMinor).toBe(1050);
  });
});
