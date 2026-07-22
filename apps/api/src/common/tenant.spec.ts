import { ForbiddenException } from '@nestjs/common';
import { requireShopId, shopScopedWhere } from './tenant';

describe('tenant helpers', () => {
  it('requireShopId returns shopId', () => {
    expect(requireShopId({ shopId: 'shop_a' } as never)).toBe('shop_a');
  });

  it('requireShopId rejects missing venue', () => {
    expect(() => requireShopId({} as never)).toThrow(ForbiddenException);
  });

  it('shopScopedWhere includes both id and shopId', () => {
    expect(shopScopedWhere('row_1', 'shop_a')).toEqual({
      id: 'row_1',
      shopId: 'shop_a',
    });
  });

  it('shopScopedWhere does not collapse to id-only for cross-tenant calls', () => {
    const a = shopScopedWhere('shared_looking_id', 'shop_a');
    const b = shopScopedWhere('shared_looking_id', 'shop_b');
    expect(a).not.toEqual(b);
    expect(a.shopId).toBe('shop_a');
    expect(b.shopId).toBe('shop_b');
  });
});
