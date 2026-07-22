import { ForbiddenException } from '@nestjs/common';
import { ApiDomainErrorCode } from './api-error.codes';
import { resolveVenueShopId } from './resolve-venue-shop';

function expectForbiddenWithCode(err: unknown, code: string) {
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({ code });
}

describe('resolveVenueShopId', () => {
  const prisma = {
    shop: { findFirst: jest.fn() },
    membership: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns JWT shopId when already bound', async () => {
    await expect(
      resolveVenueShopId(prisma as never, { shopId: 'shop_a' } as never),
    ).resolves.toBe('shop_a');
    expect(prisma.shop.findFirst).not.toHaveBeenCalled();
  });

  it('binds slug-only when membership exists', async () => {
    prisma.shop.findFirst.mockResolvedValue({ id: 'shop_b' });
    prisma.membership.findFirst.mockResolvedValue({ id: 'm1' });

    await expect(
      resolveVenueShopId(
        prisma as never,
        { sub: 'user_1', sysRole: 'USER' } as never,
        'arcade',
      ),
    ).resolves.toBe('shop_b');

    expect(prisma.shop.findFirst).toHaveBeenCalledWith({
      where: { slug: 'arcade' },
      select: { id: true },
    });
  });

  it('Phase 3: legacy slug--key binds by slug only (key ignored)', async () => {
    prisma.shop.findFirst.mockResolvedValue({ id: 'shop_c' });
    prisma.membership.findFirst.mockResolvedValue({ id: 'm1' });

    await resolveVenueShopId(
      prisma as never,
      { sub: 'user_1', sysRole: 'USER' } as never,
      'arcade--dashKey99',
    );

    expect(prisma.shop.findFirst).toHaveBeenCalledWith({
      where: { slug: 'arcade' },
      select: { id: true },
    });
  });

  it('rejects slug-only without membership', async () => {
    prisma.shop.findFirst.mockResolvedValue({ id: 'shop_b' });
    prisma.membership.findFirst.mockResolvedValue(null);

    await expect(
      resolveVenueShopId(
        prisma as never,
        { sub: 'user_1', sysRole: 'USER' } as never,
        'arcade',
      ),
    ).rejects.toMatchObject({
      response: { code: ApiDomainErrorCode.VENUE_ACCESS_DENIED },
    });
  });

  it('throws VENUE_ACCESS_DENIED when venue path missing', async () => {
    try {
      await resolveVenueShopId(
        prisma as never,
        { sub: 'user_1', sysRole: 'USER' } as never,
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.VENUE_ACCESS_DENIED);
    }
  });

  it('allows SUPER_ADMIN slug-only without membership', async () => {
    prisma.shop.findFirst.mockResolvedValue({ id: 'shop_b' });

    await expect(
      resolveVenueShopId(
        prisma as never,
        { sub: 'admin', sysRole: 'SUPER_ADMIN' } as never,
        'arcade',
      ),
    ).resolves.toBe('shop_b');
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });
});
