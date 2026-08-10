import { calculateLineTotals } from './ordering-pricing.service';

describe('Ordering 2.0 server pricing', () => {
  it('calculates variant, modifiers, quantity and tax entirely from server inputs', () => {
    expect(calculateLineTotals({ unitBaseMinor: 1000, variantMinor: 250, modifierMinor: 150, quantity: 2, taxRateBps: 800 })).toEqual({ unitPriceMinor: 1400, subtotalMinor: 2800, taxMinor: 224, totalMinor: 3024 });
  });
  it('handles zero tax without floating point money', () => {
    expect(calculateLineTotals({ unitBaseMinor: 999, variantMinor: 0, modifierMinor: 0, quantity: 3, taxRateBps: 0 }).totalMinor).toBe(2997);
  });
});
