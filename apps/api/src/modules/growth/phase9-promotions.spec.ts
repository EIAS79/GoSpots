import { computePricingQuote, conditionMatches } from './growth.rules';

describe('Phase 9 promotion acceptance', () => {
  it('applies stackable promotions deterministically by priority', () => {
    const quote = computePricingQuote({
      subtotalMinor: 10_000,
      promotions: [
        {
          id: 'low-fixed',
          name: '500 off',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 500,
          priority: 10,
          stackable: true,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
        {
          id: 'high-percent',
          name: '10 percent',
          kind: 'PERCENT',
          valueBps: 1_000,
          amountMinor: null,
          priority: 20,
          stackable: true,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
      ],
    });

    expect(quote.appliedPromotions.map((row) => row.id)).toEqual([
      'high-percent',
      'low-fixed',
    ]);
    expect(quote.discountMinor).toBe(1_500);
    expect(quote.totalMinor).toBe(8_500);
  });

  it('blocks lower-priority promotions after a non-stackable winner', () => {
    const quote = computePricingQuote({
      subtotalMinor: 10_000,
      promotions: [
        {
          id: 'winner',
          name: 'VIP fixed',
          kind: 'FIXED',
          valueBps: null,
          amountMinor: 2_000,
          priority: 50,
          stackable: false,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
        {
          id: 'loser',
          name: 'Extra 10 percent',
          kind: 'PERCENT',
          valueBps: 1_000,
          amountMinor: null,
          priority: 10,
          stackable: true,
          exclusiveGroup: null,
          minSubtotalMinor: 0,
        },
      ],
    });

    expect(quote.appliedPromotions).toHaveLength(1);
    expect(quote.appliedPromotions[0].id).toBe('winner');
    expect(
      quote.evaluatedPromotions.find((row) => row.id === 'loser')?.status,
    ).toBe('SKIPPED_NON_STACKABLE');
  });

  it('evaluates normal and overnight time windows without timezone-free date guessing', () => {
    const normal = { kind: 'TIME_WINDOW', value: { from: '17:00', to: '19:00' } };
    expect(
      conditionMatches(normal, { at: new Date(2026, 7, 18, 18, 0) }, 1_000),
    ).toBe(true);
    expect(
      conditionMatches(normal, { at: new Date(2026, 7, 18, 19, 0) }, 1_000),
    ).toBe(false);

    const overnight = {
      kind: 'TIME_WINDOW',
      value: { from: '22:00', to: '02:00' },
    };
    expect(
      conditionMatches(overnight, { at: new Date(2026, 7, 18, 23, 30) }, 1_000),
    ).toBe(true);
    expect(
      conditionMatches(overnight, { at: new Date(2026, 7, 19, 1, 30) }, 1_000),
    ).toBe(true);
    expect(
      conditionMatches(overnight, { at: new Date(2026, 7, 19, 3, 0) }, 1_000),
    ).toBe(false);
  });
});
