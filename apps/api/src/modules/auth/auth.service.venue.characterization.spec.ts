import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccountType } from '@prisma/client';
import type { JwtAccessPayload } from './auth.types';
import { AuthService } from './auth.service';

/**
 * Bible §14 Phase 4–6 PREP: characterization tests for AuthService venue
 * dashboard bind wire (`bindVenueSession`). Path resolution and
 * `verifyVenueDashboard` are locked in auth.service.venue-path.spec.ts;
 * this file locks JWT re-issue + shop profile return on bind.
 */

describe('AuthService venue bind characterization (Phase 4–6 prep)', () => {
  const notifications = {} as never;
  const audit = {} as never;
  const mail = {} as never;

  const shopRow = {
    id: 'shop_1',
    slug: 'arcade',
    name: 'Arcade',
    locale: 'en',
    currency: 'USD',
    city: null,
    isPublished: true,
  };

  const shopProfile = {
    id: 'shop_1',
    name: 'Arcade',
    displayName: 'Arcade Fun',
    slug: 'arcade',
    description: null,
    address: null,
    city: null,
    country: null,
    phone: null,
    email: null,
    coverImage: null,
    locale: 'en',
    currency: 'USD',
    isPublished: true,
    floorCount: 1,
  };

  const staffActor: JwtAccessPayload = {
    sub: 'user_staff',
    sysRole: 'USER',
    email: 'alice@arcade.locora',
    acct: UserAccountType.VENUE_STAFF,
    sid: 'sess_1',
  };

  function makeService(prisma: Record<string, unknown>) {
    const signAsync = jest.fn().mockResolvedValue('scoped.access.jwt');
    const jwt = { signAsync } as unknown as JwtService;
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'JWT_ACCESS_TTL') return '900';
        return fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    const svc = new AuthService(
      prisma as never,
      jwt,
      config,
      notifications,
      audit,
      mail,
    );
    return { svc, signAsync };
  }

  function bindMocks(overrides: {
    membership?: Record<string, unknown> | null;
    shopMissing?: boolean;
    profileMissing?: boolean;
  } = {}) {
    const findFirst = jest.fn().mockResolvedValue(
      overrides.shopMissing ? null : shopRow,
    );
    const findMembership = jest
      .fn()
      .mockResolvedValue(
        overrides.membership === undefined
          ? {
              id: 'm1',
              role: 'STAFF',
              permissionRows: [{ permission: 'reservation.read' }],
            }
          : overrides.membership,
      );
    const findUnique = jest
      .fn()
      .mockImplementation(({ include }: { include?: unknown }) => {
        if (include) {
          return Promise.resolve({
            ...shopRow,
            subscription: { tier: 'PRO' },
          });
        }
        return Promise.resolve(
          overrides.profileMissing ? null : shopProfile,
        );
      });

    return {
      prisma: {
        shop: { findFirst, findUnique },
        membership: { findFirst: findMembership },
      },
      findFirst,
      findMembership,
      findUnique,
      signAsync: undefined as jest.Mock | undefined,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('bindVenueSession', () => {
    it('re-issues a venue-scoped access token and returns public shop profile', async () => {
      const mocks = bindMocks();
      const { svc, signAsync } = makeService(mocks.prisma);

      const out = await svc.bindVenueSession(staffActor, 'arcade');

      expect(out.accessToken).toBe('scoped.access.jwt');
      expect(out.accessExpiresIn).toBe(900);
      expect(out.shop).toEqual(shopProfile);
      expect(out.shop).not.toHaveProperty('dashboardKey');
      expect(signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user_staff',
          shopId: 'shop_1',
          shopRole: 'STAFF',
          perms: 'reservation.read',
          tier: 'PRO',
        }),
        expect.objectContaining({
          secret: 'test-access-secret',
          expiresIn: 900,
        }),
      );
      expect(mocks.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'arcade' },
          select: expect.not.objectContaining({ dashboardKey: true }),
        }),
      );
    });

    it('SUPER_ADMIN binds without membership and grants wildcard perms', async () => {
      const mocks = bindMocks();
      const { svc, signAsync } = makeService(mocks.prisma);
      const admin: JwtAccessPayload = {
        sub: 'admin_1',
        sysRole: 'SUPER_ADMIN',
        email: 'admin@locora.com',
      };

      await svc.bindVenueSession(admin, 'arcade');

      expect(mocks.findMembership).not.toHaveBeenCalled();
      expect(signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          shopRole: 'OWNER',
          perms: '*',
        }),
        expect.any(Object),
      );
    });

    it('Phase 3: legacy slug--key path strips to slug for bind lookup', async () => {
      const mocks = bindMocks();
      const { svc } = makeService(mocks.prisma);

      await svc.bindVenueSession(staffActor, 'arcade--secret-key');

      expect(mocks.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'arcade' },
        }),
      );
    });

    it('rejects invalid venue dashboard paths before shop lookup', async () => {
      const findFirst = jest.fn();
      const { svc } = makeService({
        shop: { findFirst },
        membership: { findFirst: jest.fn() },
      });

      await expect(
        svc.bindVenueSession(staffActor, 'arcade/extra-segment'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the user has no active membership for the venue', async () => {
      const mocks = bindMocks({ membership: null });
      const { svc } = makeService(mocks.prisma);

      await expect(
        svc.bindVenueSession(staffActor, 'arcade'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when shop profile row is missing after verify', async () => {
      const mocks = bindMocks({ profileMissing: true });
      const { svc } = makeService(mocks.prisma);

      await expect(
        svc.bindVenueSession(staffActor, 'arcade'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
