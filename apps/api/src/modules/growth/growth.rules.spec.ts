import {
  clipSeconds,
  computePricingQuote,
  intervalsOverlap,
  projectPointsBalance,
  projectSignedBalance,
  signedLedgerAmount,
} from './growth.rules';

describe('growth rules', () => {
  it('applies deterministic promotion priority and records non-stackable skips', () => {
    const quote = computePricingQuote({
      subtotalMinor: 10000,
      taxMinor: 800,
      tipBps: 1000,
      promotions: [
        {
          id: 'b',
          name: 'small',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 500,
          priority: 1,
          stackable: true,
          exclusiveGroup: 'season',
          minSubtotalMinor: 0,
        },
        {
          id: 'a',
          name: 'vip',
          kind: 'PERCENT',
          valueBps: 1000,
          amountMinor: null,
          priority: 10,
          stackable: true,
          exclusiveGroup: 'season',
          minSubtotalMinor: 0,
        },
        {
          id: 'c',
          name: 'flash',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 1000,
          priority: 5,
          stackable: false,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
        {
          id: 'd',
          name: 'never-after-exclusive',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 1000,
          priority: 0,
          stackable: true,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
      ],
    });

    expect(quote.appliedPromotions.map((x) => x.id)).toEqual(['a', 'c']);
    expect(quote.evaluatedPromotions.map((x) => [x.id, x.status])).toEqual([
      ['a', 'APPLIED'],
      ['c', 'APPLIED'],
      ['b', 'SKIPPED_NON_STACKABLE'],
      ['d', 'SKIPPED_NON_STACKABLE'],
    ]);
    expect(quote.discountMinor).toBe(2000);
    expect(quote.tipMinor).toBe(800);
    expect(quote.totalMinor).toBe(9600);
  });

  it('records exclusive-group conflicts independently of non-stackable rules', () => {
    const quote = computePricingQuote({
      subtotalMinor: 5000,
      promotions: [
        {
          id: 'high',
          name: 'high',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 500,
          priority: 10,
          stackable: true,
          exclusiveGroup: 'season',
          minSubtotalMinor: 0,
        },
        {
          id: 'low',
          name: 'low',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 700,
          priority: 1,
          stackable: true,
          exclusiveGroup: 'season',
          minSubtotalMinor: 0,
        },
      ],
    });

    expect(quote.appliedPromotions.map((x) => x.id)).toEqual(['high']);
    expect(quote.evaluatedPromotions.find((x) => x.id === 'low')?.status).toBe(
      'SKIPPED_EXCLUSIVE_GROUP',
    );
  });

  it('records condition inputs, per-condition results, and benefit calculations', () => {
    const quote = computePricingQuote({
      subtotalMinor: 10000,
      context: { partySize: 3, bookingChannel: 'WEB' },
      promotions: [
        {
          id: 'party',
          name: 'party',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 1000,
          priority: 5,
          stackable: true,
          exclusiveGroup: null,
          minSubtotalMinor: 2000,
          conditions: [
            { kind: 'PARTY_SIZE', operator: 'GTE', value: 4 },
            { kind: 'BOOKING_CHANNEL', operator: 'EQ', value: 'WEB' },
          ],
          benefits: [{ kind: 'FIXED', value: { amountMinor: 1000 } }],
        },
      ],
    });

    const evidence = quote.evaluatedPromotions[0];
    expect(evidence.status).toBe('SKIPPED_CONDITIONS');
    expect(evidence.minSubtotalMatched).toBe(true);
    expect(evidence.conditionResults.map((x) => x.matched)).toEqual([false, true]);
    expect(evidence.conditionSnapshot).toHaveLength(2);
    expect(evidence.benefitSnapshots).toHaveLength(1);
    expect(evidence.benefitResults).toEqual([]);
  });

  it('records a zero-benefit match instead of silently dropping it', () => {
    const quote = computePricingQuote({
      subtotalMinor: 1000,
      promotions: [
        {
          id: 'zero',
          name: 'zero',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 0,
          priority: 0,
          stackable: true,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
      ],
    });

    expect(quote.appliedPromotions).toEqual([]);
    expect(quote.evaluatedPromotions[0]?.status).toBe('SKIPPED_ZERO_BENEFIT');
    expect(quote.evaluatedPromotions[0]?.benefitResults[0]?.discountMinor).toBe(0);
  });

  it('never discounts below zero', () => {
    expect(
      computePricingQuote({
        subtotalMinor: 500,
        promotions: [
          {
            id: 'x',
            name: 'x',
            kind: 'FIXED',
            valueBps: null,
            amountMinor: 9999,
            priority: 0,
            stackable: true,
            exclusiveGroup: null,
            minSubtotalMinor: 0,
          },
        ],
      }).totalMinor,
    ).toBe(0);
  });

  it('projects append-only money and points balances', () => {
    expect(projectSignedBalance([{ amountMinor: 1000 }, { amountMinor: -250 }])).toBe(
      750,
    );
    expect(projectPointsBalance([{ points: 50 }, { points: -20 }])).toBe(30);
    expect(signedLedgerAmount('REDEEM', 200, ['REDEEM'])).toBe(-200);
  });

  it('uses half-open interval semantics and clips utilization seconds', () => {
    const a = new Date('2026-01-01T10:00:00Z');
    const b = new Date('2026-01-01T11:00:00Z');
    const c = new Date('2026-01-01T11:00:00Z');
    const d = new Date('2026-01-01T12:00:00Z');
    expect(intervalsOverlap(a, b, c, d)).toBe(false);
    expect(
      clipSeconds(
        a,
        d,
        new Date('2026-01-01T10:30:00Z'),
        new Date('2026-01-01T11:15:00Z'),
      ),
    ).toBe(2700);
  });
});
