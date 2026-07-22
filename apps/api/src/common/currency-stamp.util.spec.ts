import {
  effectiveMoneyCurrency,
  loadShopCurrency,
  normalizeCurrencyCode,
} from './currency-stamp.util';

describe('currency-stamp.util', () => {
  it('normalizes codes to uppercase', () => {
    expect(normalizeCurrencyCode('eur')).toBe('EUR');
    expect(normalizeCurrencyCode('  usd ')).toBe('USD');
    expect(normalizeCurrencyCode(null)).toBeNull();
    expect(normalizeCurrencyCode('')).toBeNull();
  });

  it('dual-reads row stamp then shop fallback', () => {
    expect(effectiveMoneyCurrency('USD', 'EUR')).toBe('USD');
    expect(effectiveMoneyCurrency(null, 'EUR')).toBe('EUR');
    expect(effectiveMoneyCurrency(undefined, 'pln')).toBe('PLN');
  });

  it('loadShopCurrency returns shop code', async () => {
    const prisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({ currency: 'gbp' }),
      },
    };
    await expect(
      loadShopCurrency(prisma as never, 'shop-1'),
    ).resolves.toBe('GBP');
  });

  it('loadShopCurrency defaults when shop missing', async () => {
    const prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      loadShopCurrency(prisma as never, 'missing'),
    ).resolves.toBe('EUR');
  });
});
