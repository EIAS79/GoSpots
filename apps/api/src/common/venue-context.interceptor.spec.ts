import { VenueContextInterceptor } from './venue-context.interceptor';

describe('VenueContextInterceptor', () => {
  const prisma = {
    shop: { findFirst: jest.fn() },
    membership: { findFirst: jest.fn() },
  };

  const interceptor = new VenueContextInterceptor(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function apply(
    user: Record<string, unknown>,
    venuePath: string | undefined,
  ) {
    const req = {
      user,
      headers: venuePath ? { 'x-venue-path': venuePath } : {},
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    };
    await interceptor.intercept(context as never, {
      handle: () => ({ subscribe: () => undefined }),
    } as never);
    return req.user;
  }

  it('binds shopId from slug-only path with active membership', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: 'shop_1',
      subscription: { tier: 'STANDARD' },
    });
    prisma.membership.findFirst.mockResolvedValue({
      role: 'OWNER',
      permissionRows: [{ permission: '*' }],
    });

    const user = await apply({ sub: 'u1', sysRole: 'USER' }, 'arcade');
    expect(user.shopId).toBe('shop_1');
    expect(user.shopRole).toBe('OWNER');
    expect(prisma.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'arcade' } }),
    );
  });

  it('does not bind slug-only without membership', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: 'shop_1',
      subscription: null,
    });
    prisma.membership.findFirst.mockResolvedValue(null);

    const user = await apply({ sub: 'u1', sysRole: 'USER' }, 'arcade');
    expect(user.shopId).toBeUndefined();
  });

  it('Phase 3: legacy slug--key binds by slug only (key ignored)', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: 'shop_1',
      subscription: null,
    });
    prisma.membership.findFirst.mockResolvedValue({
      role: 'STAFF',
      permissionRows: [{ permission: 'floor.view' }],
    });

    await apply({ sub: 'u1', sysRole: 'USER' }, 'arcade--keyABC');
    expect(prisma.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'arcade' },
      }),
    );
  });
});
