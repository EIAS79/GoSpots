import {
  isPaidWalkInPlaySession,
  sumRevenueChannels,
  sumRevenueChannelsByCurrency,
} from './finance-analytics.util';

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
