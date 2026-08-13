import { performance } from 'node:perf_hooks';
import { listOpeningWindows } from '../../common/opening-hours.util';
import { GrowthAnalyticsService } from './growth-analytics.service';

jest.mock('../../common/opening-hours.util', () => ({
  listOpeningWindows: jest.fn(),
}));

const mockedOpeningWindows = listOpeningWindows as jest.MockedFunction<
  typeof listOpeningWindows
>;
const actor = { sub: 'phase-4-benchmark', shopId: 'shop-scale' } as any;
const money = (minor: number) => ({
  toString: () => (minor / 100).toFixed(2),
});

const SCALE = {
  ledgerEntries: 20_000,
  payments: 18_000,
  refunds: 2_000,
  pricingSnapshots: 10_000,
  tips: 5_000,
  stockMovements: 10_000,
  punches: 2_000,
  resources: 250,
  sessions: 5_000,
  reservations: 5_000,
  waitlist: 2_000,
  prepTickets: 5_000,
  visits: 5_000,
  acquisitionEvidence: 5_000,
  ruleApplications: 5_000,
} as const;

// This is deliberately generous enough to avoid CI-machine noise while still catching
// accidental quadratic regressions at the representative synthetic scale above.
const MAX_INTERACTIVE_MS = 5_000;
const MAX_OVERVIEW_MS = 10_000;

function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  return run().then((value) => ({ value, ms: performance.now() - started }));
}

function buildPrisma(options: { providerMismatch?: boolean } = {}) {
  const from = new Date('2026-08-01T00:00:00.000Z');
  const sessionStart = new Date('2026-08-01T10:00:00.000Z');
  const sessionEnd = new Date('2026-08-01T11:00:00.000Z');
  const readyAt = new Date('2026-08-01T10:08:00.000Z');

  const ledger = Array.from({ length: SCALE.ledgerEntries }, (_, index) => ({
    kind: index < SCALE.refunds ? 'REFUND' : 'SALE',
    currency: 'PLN',
    amount: money(1_000),
  }));
  const payments = Array.from({ length: SCALE.payments }, () => ({
    currency: 'PLN',
    amount: money(1_000),
  }));
  if (options.providerMismatch && payments.length) {
    payments[0] = { currency: 'PLN', amount: money(900) };
  }
  const refunds = Array.from({ length: SCALE.refunds }, () => ({
    currency: 'PLN',
    amount: money(1_000),
  }));
  const snapshots = Array.from(
    { length: SCALE.pricingSnapshots },
    (_, index) => ({
      id: `snapshot-${index}`,
      sourceType: 'CHECK',
      sourceId: `check-${index}`,
      currency: 'PLN',
      discountMinor: index % 5,
      totalMinor: 1_000,
      rules: { packageCostMinor: index % 7 },
    }),
  );
  const tips = Array.from({ length: SCALE.tips }, () => ({
    currency: 'PLN',
    amountMinor: 100,
  }));
  const movements = Array.from({ length: SCALE.stockMovements }, () => ({
    kind: 'SALE_CONSUMPTION',
    totalCostMinor: 200,
  }));
  const punches = Array.from({ length: SCALE.punches }, (_, index) => ({
    id: `punch-${index}`,
    currency: 'PLN',
    startedAt: sessionStart,
    endedAt: sessionEnd,
    hourlyRateMinor: 3_000,
  }));
  const breaks = punches.map((punch) => ({
    timePunchId: punch.id,
    paid: false,
    startedAt: new Date('2026-08-01T10:20:00.000Z'),
    endedAt: new Date('2026-08-01T10:30:00.000Z'),
  }));

  const resources = Array.from({ length: SCALE.resources }, (_, index) => ({
    id: `resource-${index}`,
    name: `Resource ${index}`,
    type: 'TABLE',
    categoryId: null,
  }));
  const sessions = Array.from({ length: SCALE.sessions }, (_, index) => ({
    id: `session-${index}`,
    resourceId: `resource-${index % SCALE.resources}`,
    guestCheckId: null,
    startedAt: sessionStart,
    finishedAt: sessionEnd,
    accruedMinor: 1_000,
  }));
  const reservations = Array.from(
    { length: SCALE.reservations },
    (_, index) => ({
      id: `reservation-${index}`,
      status: index % 10 === 0 ? 'NO_SHOW' : 'CONFIRMED',
      startsAt: new Date('2026-08-01T12:00:00.000Z'),
      billedAmount: money(1_000),
      guestCheckId: null,
    }),
  );
  const waitlist = Array.from({ length: SCALE.waitlist }, (_, index) => ({
    id: `wait-${index}`,
    status: index % 2 === 0 ? 'CLAIMED' : 'OFFERED',
    createdAt: from,
    offeredAt: from,
  }));
  const stations = [{ id: 'station-1', targetSeconds: 600 }];
  const tickets = Array.from({ length: SCALE.prepTickets }, (_, index) => ({
    id: `ticket-${index}`,
    stationId: 'station-1',
    openedAt: sessionStart,
    startedAt: sessionStart,
    readyAt,
    canceledAt: null,
  }));

  const visits = Array.from({ length: SCALE.visits }, (_, index) => ({
    id: `visit-${index}`,
    customerId: `customer-${index}`,
    reservationId: `reservation-${index}`,
    completedAt: sessionEnd,
    settledAmountMinor: 1_000,
  }));
  const evidence = Array.from(
    { length: SCALE.acquisitionEvidence },
    (_, index) => ({
      reservationId: `reservation-${index}`,
      sourceChannel: index % 2 === 0 ? 'PUBLIC_WEB' : 'DIRECT',
      createdAt: from,
    }),
  );
  const applications = Array.from(
    { length: SCALE.ruleApplications },
    (_, index) => ({
      promotionId: `promotion-${index % 100}`,
      discountMinor: 25,
      pricingSnapshotId: `snapshot-${index}`,
      createdAt: from,
    }),
  );

  return {
    shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'PLN' }) },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue(ledger) },
    payment: { findMany: jest.fn().mockResolvedValue(payments) },
    refund: { findMany: jest.fn().mockResolvedValue(refunds) },
    pricingSnapshot: { findMany: jest.fn().mockResolvedValue(snapshots) },
    tipLedgerEntry: { findMany: jest.fn().mockResolvedValue(tips) },
    stockMovement: { findMany: jest.fn().mockResolvedValue(movements) },
    timePunch: { findMany: jest.fn().mockResolvedValue(punches) },
    breakRecord: { findMany: jest.fn().mockResolvedValue(breaks) },
    resource: { findMany: jest.fn().mockResolvedValue(resources) },
    operationsSession: { findMany: jest.fn().mockResolvedValue(sessions) },
    resourceMaintenancePeriod: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue(reservations) },
    reservationWaitlistEntry: { findMany: jest.fn().mockResolvedValue(waitlist) },
    prepTicket: { findMany: jest.fn().mockResolvedValue(tickets) },
    prepStation: { findMany: jest.fn().mockResolvedValue(stations) },
    operationsSessionPause: { findMany: jest.fn().mockResolvedValue([]) },
    guestCheck: { findMany: jest.fn().mockResolvedValue([]) },
    venueOrder: { findMany: jest.fn().mockResolvedValue([]) },
    venueOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
    customerVisit: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(visits)
        .mockResolvedValueOnce([]),
    },
    loyaltyLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    storedValueLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    reservationBookingEvidence: { findMany: jest.fn().mockResolvedValue(evidence) },
    ruleApplication: { findMany: jest.fn().mockResolvedValue(applications) },
  } as any;
}

describe('GrowthAnalyticsService Phase 4 representative-scale gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedOpeningWindows.mockResolvedValue([
      {
        opensAt: new Date('2026-08-01T08:00:00.000Z'),
        closesAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ] as any);
  });

  it('keeps Finance, Operations and Guests within the interactive scale target', async () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-02T00:00:00.000Z');

    const finance = await timed(() =>
      new GrowthAnalyticsService(buildPrisma()).finance(actor, from, to),
    );
    expect(finance.value.reconciliation.ok).toBe(true);
    expect(finance.ms).toBeLessThan(MAX_INTERACTIVE_MS);

    const operations = await timed(() =>
      new GrowthAnalyticsService(buildPrisma()).operations(actor, from, to),
    );
    expect(operations.value.resources.resourceCount).toBe(SCALE.resources);
    expect(operations.ms).toBeLessThan(MAX_INTERACTIVE_MS);

    const guests = await timed(() =>
      new GrowthAnalyticsService(buildPrisma()).guests(actor, from, to),
    );
    expect(guests.value.visits.completedVisitCount).toBe(SCALE.visits);
    expect(guests.ms).toBeLessThan(MAX_INTERACTIVE_MS);
  }, 30_000);

  it('keeps Overview within target at representative scale', async () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-02T00:00:00.000Z');
    const result = await timed(() =>
      new GrowthAnalyticsService(buildPrisma()).overview(actor, from, to),
    );

    expect(result.value.cards.netSettledRevenueByCurrency.PLN).toBeDefined();
    expect(result.ms).toBeLessThan(MAX_OVERVIEW_MS);
  }, 30_000);

  it('still surfaces a seeded provider/Ledger mismatch at representative finance scale', async () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-02T00:00:00.000Z');
    const result = await new GrowthAnalyticsService(
      buildPrisma({ providerMismatch: true }),
    ).finance(actor, from, to);

    expect(result.reconciliation.ok).toBe(false);
    expect(result.reconciliation.byCurrency.PLN).toBe(100);
  }, 15_000);
});
