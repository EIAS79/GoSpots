import { Prisma } from '@prisma/client';
import {
  addCanonicalMoney,
  allocateMoneyDecimal,
  discountMoneyDecimal,
  percentageMoneyDecimal,
  splitMoneyByWeightsDecimal,
  subtractCanonicalMoney,
  taxFromGrossDecimal,
  makeMoney,
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
} from './money.util';

describe('money exact helpers', () => {
  it('adds decimal amounts without IEEE-754 drift', () => {
    const total = sumMoneyDecimal('0.1', '0.2');
    expect(total.equals(new Prisma.Decimal('0.3'))).toBe(true);
    expect(serializeMoney(total)).toBe('0.3000');
  });

  it('rounds HALF_UP explicitly at currency boundaries', () => {
    expect(roundMoneyDecimal('10.005', 2).toFixed(2)).toBe('10.01');
  });

  it('normalizes currency and rejects cross-currency addition', () => {
    const pln = makeMoney('10', 'pln');
    expect(pln.currency).toBe('PLN');
    expect(() => addCanonicalMoney(pln, makeMoney('1', 'EUR'))).toThrow(
      'different currencies',
    );
  });

  it('subtracts only matching currencies and rounds percentages deterministically', () => {
    expect(
      subtractCanonicalMoney(makeMoney('10.00', 'PLN'), makeMoney('3.25', 'PLN')).amount.toFixed(2),
    ).toBe('6.75');
    expect(percentageMoneyDecimal('10.05', '12.5').toFixed(2)).toBe('1.26');
    expect(discountMoneyDecimal('10.05', '12.5').toFixed(2)).toBe('8.79');
    expect(taxFromGrossDecimal('123.00', '23').toFixed(2)).toBe('23.00');
  });

  it('allocates residual cents deterministically', () => {
    expect(allocateMoneyDecimal('10.00', 3).map((part) => part.toFixed(2))).toEqual([
      '3.34',
      '3.33',
      '3.33',
    ]);
    expect(
      splitMoneyByWeightsDecimal('0.05', [1, 1, 1]).map((part) => part.toFixed(2)),
    ).toEqual(['0.02', '0.02', '0.01']);
  });

  it('conserves exact minor units across generated equal and weighted splits', () => {
    let seed = 0x5eed;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const cents = (random() % 2_000_001) - 1_000_000;
      const count = (random() % 12) + 1;
      const total = new Prisma.Decimal(cents).div(100);
      const equal = allocateMoneyDecimal(total, count);
      expect(sumMoneyDecimal(...equal).equals(total)).toBe(true);

      const weights = Array.from({ length: count }, () => (random() % 100) + 1);
      const weighted = splitMoneyByWeightsDecimal(total, weights);
      expect(sumMoneyDecimal(...weighted).equals(total)).toBe(true);
    }
  });
});
