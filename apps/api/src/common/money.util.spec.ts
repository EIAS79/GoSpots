import { Prisma } from '@prisma/client';
import {
  addCanonicalMoney,
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
});
