import {
  buildFinanceAnalytics,
  FINANCE_ANALYTICS_ROW_TAKE,
  isPaidWalkInPlaySession,
  sumLedgerSaleChannels,
  sumRevenueChannels,
  sumRevenueChannelsByCurrency,
} from './finance-analytics.util';

jest.mock('../../common/ledger-post.util', () => ({
  isLedgerReadsEnabled: jest.fn(() => false),
}));

jest.mock('../../common/shop-venue-time.util', () => ({
  loadShopVenueTimeContext: jest.fn(async () => ({
    resolvedTimeZone: 'UTC',
  })),
}));

const { isLedgerReadsEnabled } = jest.requireMock('../../common/ledger-post.util');

describe('buildFinanceAnalytics take caps (PERF35)', () => {
  const shopId = 'shop-analytics-cap';

  function makePrisma() {
    const findMany = jest.fn(async (args?: { take?: number }) => {
      const take = args?.take ?? FINANCE_ANALYTICS_ROW_TAKE;
      return Array.from({ length: take }, (_, i) => ({
        amount: { toString: () => '1.0000' },
        total: { toString: () => '1.0000' },
        currency: 'EUR',
        createdAt: new Date(`2026-07-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`),
        completedAt: new Date(`2026-07-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`),
        updatedAt: new Date(`2026-07-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`),
        occurredAt: new Date(`2026-07-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`),
        billedAt: new Date(`2026-07-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`),
        billedAmount: { toString: () => '1.0000' },
        startsAt: new Date(`2026-07-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`),
        status: 'COMPLETED',
        guestCount: 1,
        partySize: 1,
        playerCount: 1,
        resourceId: null,
        reservationId: null,
        type: 'VENUE_VIEW',
        kind: 'SALE',
        method: 'CASH',
        paymentMethod: 'CASH',
        billingPaymentMethod: 'CASH',
        menuItemId: 'item-1',
        name: 'Coffee',
        quantity: 1,
        unitPrice: { toString: () => '1.0000' },
      }));
    });

    return {
      shop: {
        findUnique: jest.fn(async () => ({ currency: 'EUR' })),
      },
      transaction: {
        findMany,
        count: jest.fn(async () => FINANCE_ANALYTICS_ROW_TAKE),
      },
      shopOrder: { findMany },
      reservation: { findMany },
      playSession: { findMany },
      shopLoss: { findMany },
      analyticsEvent: { findMany },
      transactionLineItem: {
        groupBy: jest.fn(async () => []),
      },
      shopOrderLine: { findMany },
      ledgerEntry: { findMany },
    };
  }

  beforeEach(() => {
    isLedgerReadsEnabled.mockReturnValue(false);
  });

  it('passes FINANCE_ANALYTICS_ROW_TAKE to bounded findMany queries', async () => {
    const prisma = makePrisma();
    await buildFinanceAnalytics(prisma as never, shopId, 7);

    for (const call of prisma.transaction.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
    for (const call of prisma.shopOrder.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
    for (const call of prisma.reservation.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
    for (const call of prisma.playSession.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
    for (const call of prisma.shopLoss.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
    for (const call of prisma.analyticsEvent.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
    for (const call of prisma.shopOrderLine.findMany.mock.calls) {
      expect(call[0]?.take).toBe(FINANCE_ANALYTICS_ROW_TAKE);
    }
  });

  it('sets analyticsTruncated when a source hits the take cap', async () => {
    const prisma = makePrisma();
    const out = await buildFinanceAnalytics(prisma as never, shopId, 7);

    expect(out.summary.analyticsTruncated).toBe(true);
    expect(out.summary.analyticsTruncatedSources).toEqual(
      expect.arrayContaining(['revenueTransactions']),
    );
  });

  it('omits truncation fields when under cap', async () => {
    const prisma = makePrisma();
    prisma.transaction.findMany.mockImplementation(async (args?: { take?: number }) => {
      const take = args?.take ?? FINANCE_ANALYTICS_ROW_TAKE;
      return Array.from({ length: take - 1 }, () => ({
        amount: { toString: () => '1.0000' },
        currency: 'EUR',
        createdAt: new Date('2026-07-15T12:00:00Z'),
        method: 'CASH',
      }));
    });
    prisma.shopOrder.findMany.mockResolvedValue([]);
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.playSession.findMany.mockResolvedValue([]);
    prisma.shopLoss.findMany.mockResolvedValue([]);
    prisma.analyticsEvent.findMany.mockResolvedValue([]);
    prisma.shopOrderLine.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(0);

    const out = await buildFinanceAnalytics(prisma as never, shopId, 7);

    expect(out.summary.analyticsTruncated).toBeUndefined();
    expect(out.summary.analyticsTruncatedSources).toBeUndefined();
  });
});

describe('sumRevenueChannels (finance contract)', () => {
  it('sums four exclusive channels without overlap', () => {
    const channels = sumRevenueChannels({
      orders: [{ total: 10 }, { total: 5 }],
      transactions: [{ amount: 3 }],
      billedReservations: [
        { billedAmount: 20, resourceId: 'res-1' }, // play
        { billedAmount: 8, resourceId: null }, // dining reservation
      ],
      walkInPlaySessions: [
        { amount: 12, reservationId: null, status: 'COMPLETED' },
      ],
    });

    expect(channels.menuOrders).toBe(15);
    expect(channels.quickSales).toBe(3);
    expect(channels.playSessions).toBe(32); // 20 + 12
    expect(channels.reservations).toBe(8);
    expect(channels.total).toBe(58);
    expect(channels.total).toBe(
      channels.menuOrders +
        channels.quickSales +
        channels.playSessions +
        channels.reservations,
    );
  });

  it('does not double-count linked play when reservation is billed', () => {
    // Same economic event: resource booking marked paid ($30) AND a linked
    // PlaySession row still holding amount $30. Contract: count reservation only.
    const channels = sumRevenueChannels({
      orders: [],
      transactions: [],
      billedReservations: [{ billedAmount: 30, resourceId: 'lane-1' }],
      walkInPlaySessions: [
        {
          amount: 30,
          reservationId: 'booking-1', // must be ignored even if passed in
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      ],
    });

    expect(channels.playSessions).toBe(30);
    expect(channels.total).toBe(30);
  });

  it('counts order-only and tx-only as separate legitimate sales (not a bug)', () => {
    const orderOnly = sumRevenueChannels({
      orders: [{ total: 40 }],
      transactions: [],
      billedReservations: [],
      walkInPlaySessions: [],
    });
    const txOnly = sumRevenueChannels({
      orders: [],
      transactions: [{ amount: 40 }],
      billedReservations: [],
      walkInPlaySessions: [],
    });
    const bothDistinct = sumRevenueChannels({
      orders: [{ total: 40 }],
      transactions: [{ amount: 25 }],
      billedReservations: [],
      walkInPlaySessions: [],
    });

    expect(orderOnly.total).toBe(40);
    expect(txOnly.total).toBe(40);
    // Distinct channels: kitchen ticket + counter sale → additive by contract.
    expect(bothDistinct.total).toBe(65);
    expect(bothDistinct.menuOrders + bothDistinct.quickSales).toBe(65);
  });

  it('ignores unpaid / canceled walk-ins', () => {
    const channels = sumRevenueChannels({
      orders: [],
      transactions: [],
      billedReservations: [],
      walkInPlaySessions: [
        { amount: 9, reservationId: null, status: 'ACTIVE', completedAt: null },
        { amount: 9, reservationId: null, status: 'CANCELED', completedAt: new Date() },
        {
          amount: 11,
          reservationId: null,
          status: 'ACTIVE',
          completedAt: new Date(), // mid-session mark paid
        },
      ],
    });
    expect(channels.playSessions).toBe(11);
    expect(channels.total).toBe(11);
  });

  it('splits dining billedAmount into reservations, not play', () => {
    const channels = sumRevenueChannels({
      orders: [],
      transactions: [],
      billedReservations: [{ billedAmount: 50, resourceId: null }],
      walkInPlaySessions: [],
    });
    expect(channels.reservations).toBe(50);
    expect(channels.playSessions).toBe(0);
    expect(channels.total).toBe(50);
  });
});

describe('isPaidWalkInPlaySession', () => {
  it('treats completedAt as paid (markPlaySessionPaid while ACTIVE)', () => {
    expect(
      isPaidWalkInPlaySession({ status: 'ACTIVE', completedAt: new Date() }),
    ).toBe(true);
    expect(
      isPaidWalkInPlaySession({ status: 'COMPLETED', completedAt: null }),
    ).toBe(true);
    expect(
      isPaidWalkInPlaySession({ status: 'ACTIVE', completedAt: null }),
    ).toBe(false);
    expect(
      isPaidWalkInPlaySession({ status: 'CANCELED', completedAt: new Date() }),
    ).toBe(false);
  });
});

describe('sumRevenueChannelsByCurrency', () => {
  it('keeps shop-currency totals separate from prior FX era', () => {
    const result = sumRevenueChannelsByCurrency({
      shopCurrency: 'USD',
      orders: [
        { total: 10, currency: 'USD' },
        { total: 40, currency: 'EUR' },
      ],
      transactions: [{ amount: 5, currency: null }], // dual-read → shop USD
      billedReservations: [],
      walkInPlaySessions: [],
    });
    expect(result.mixedCurrencies).toBe(true);
    expect(result.shopChannels.total).toBe(15); // 10 + 5, not EUR 40
    expect(result.byCurrency.EUR.total).toBe(40);
    expect(result.byCurrency.USD.total).toBe(15);
  });
});

describe('sumLedgerSaleChannels (Phase 4)', () => {
  it('maps ledger channels and ignores foreign currency', () => {
    const channels = sumLedgerSaleChannels(
      [
        { amount: 10, channel: 'MENU_ORDERS', currency: 'EUR' },
        { amount: 3, channel: 'QUICK_SALES', currency: 'EUR' },
        { amount: 20, channel: 'PLAY_SESSIONS', currency: 'EUR' },
        { amount: 8, channel: 'RESERVATIONS', currency: 'EUR' },
        { amount: 99, channel: 'MENU_ORDERS', currency: 'USD' },
        { amount: 5, channel: null, currency: 'EUR' },
      ],
      'EUR',
    );
    expect(channels.menuOrders).toBe(10);
    expect(channels.quickSales).toBe(3);
    expect(channels.playSessions).toBe(20);
    expect(channels.reservations).toBe(8);
    expect(channels.total).toBe(41);
  });
});
