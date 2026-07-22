import { ConflictException } from '@nestjs/common';
import { ApiDomainErrorCode } from './api-error.codes';
import {
  venueDayKey,
  applyDailyStockReset,
  assertMenuStockQty,
  canFulfillQty,
} from './menu-stock.util';

describe('menu-stock.util venueDayKey', () => {
  it('uses IANA timezone when provided', () => {
    const nearMidnightUtc = new Date('2026-07-20T23:30:00.000Z');
    expect(venueDayKey('Asia/Tokyo', nearMidnightUtc)).toBe('2026-07-21');
    expect(venueDayKey('America/New_York', nearMidnightUtc)).toBe('2026-07-20');
  });

  it('still accepts locale codes', () => {
    // pl → Europe/Warsaw
    const nearMidnightUtc = new Date('2026-07-20T23:30:00.000Z');
    expect(venueDayKey('pl', nearMidnightUtc)).toBe('2026-07-21');
  });

  it('applyDailyStockReset rolls on venue day', () => {
    const item = {
      id: '1',
      stock: 2,
      stockDaily: 10,
      stockResetOn: '2026-07-19',
      trackStock: true,
    };
    const next = applyDailyStockReset(item, 'UTC', new Date('2026-07-20T12:00:00Z'));
    expect(next.stock).toBe(10);
    expect(next.stockResetOn).toBe('2026-07-20');
  });

  it('canFulfillQty respects trackStock', () => {
    expect(canFulfillQty({ id: '1', stock: 0, stockDaily: 0, stockResetOn: null, trackStock: false }, 5)).toBe(true);
    expect(canFulfillQty({ id: '1', stock: 2, stockDaily: 2, stockResetOn: null, trackStock: true }, 3)).toBe(false);
  });

  it('assertMenuStockQty throws MENU_STOCK_INSUFFICIENT when tracked stock is short', () => {
    try {
      assertMenuStockQty(
        {
          id: 'm1',
          stock: 1,
          stockDaily: 1,
          stockResetOn: null,
          trackStock: true,
        },
        3,
        'Burger is out of stock (1 left).',
      );
      throw new Error('expected ConflictException');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT,
        message: 'Burger is out of stock (1 left).',
        details: { menuItemId: 'm1', requested: 3, available: 1 },
      });
    }
  });

  it('assertMenuStockQty is a no-op when trackStock is off', () => {
    expect(() =>
      assertMenuStockQty(
        {
          id: 'm1',
          stock: 0,
          stockDaily: 0,
          stockResetOn: null,
          trackStock: false,
        },
        99,
      ),
    ).not.toThrow();
  });
});
