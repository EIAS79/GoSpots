import { AuthService } from './auth.service';

describe('AuthService resolveVenuePathForUser / verifyVenueDashboard', () => {
  const prisma = {
    shop: { findFirst: jest.fn() },
    membership: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  function svc() {
    return new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolveVenuePathForUser returns slug only', () => {
    const path = svc().resolveVenuePathForUser({
      memberships: [
        {
          isActive: true,
          role: 'OWNER',
          shop: { slug: 'arcade' },
        },
      ],
    });
    expect(path).toBe('arcade');
    expect(path).not.toContain('--');
  });

  it('me omits shop.dashboardKey from memberships', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'owner@example.com',
      name: 'Owner',
      accountType: 'VENUE_OWNER',
      staffHandle: null,
      systemRole: 'USER',
      emailVerified: true,
      memberships: [
        {
          id: 'm1',
          role: 'OWNER',
          permissions: '*',
          permissionRows: [],
          isActive: true,
          shop: {
            id: 'shop_1',
            slug: 'arcade',
            name: 'Arcade',
            locale: 'en',
            currency: 'USD',
            subscription: null,
          },
        },
      ],
    });

    const out = await svc().me('user_1');
    expect(out.memberships).toHaveLength(1);
    expect(out.memberships[0].shop).toEqual(
      expect.objectContaining({
        id: 'shop_1',
        slug: 'arcade',
        name: 'Arcade',
      }),
    );
    expect(out.memberships[0].shop).not.toHaveProperty('dashboardKey');
    expect(JSON.stringify(out)).not.toMatch(/dashboardKey/i);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          memberships: expect.objectContaining({
            select: expect.objectContaining({
              shop: expect.objectContaining({
                select: expect.not.objectContaining({
                  dashboardKey: true,
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('verifyVenueDashboard accepts slug-only with membership', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: 'shop_1',
      slug: 'arcade',
      name: 'Arcade',
      locale: 'en',
      currency: 'USD',
      city: null,
      isPublished: true,
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: 'm1',
      role: 'OWNER',
      permissions: '*',
      permissionRows: [],
    });

    const out = await svc().verifyVenueDashboard('user_1', 'USER', 'arcade');
    expect(out.shop.slug).toBe('arcade');
    expect(out.shop).not.toHaveProperty('dashboardKey');
    expect(prisma.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'arcade' },
        select: expect.not.objectContaining({ dashboardKey: true }),
      }),
    );
  });

  it('verifyVenueDashboard Phase 3: legacy slug--key resolves by slug only', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: 'shop_1',
      slug: 'arcade',
      name: 'Arcade',
      locale: 'en',
      currency: 'USD',
      city: null,
      isPublished: true,
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: 'm1',
      role: 'OWNER',
      permissions: '*',
      permissionRows: [],
    });

    await svc().verifyVenueDashboard('user_1', 'USER', 'arcade--secret');
    expect(prisma.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'arcade' },
      }),
    );
  });
});
