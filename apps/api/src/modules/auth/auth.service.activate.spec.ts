import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ShopRole,
  SubscriptionStatus,
  SubscriptionTier,
  UserAccountType,
} from '@prisma/client';
import { hashToken } from '../../common/security/token';
import { AuthService } from './auth.service';

describe('AuthService activateStaffInvite', () => {
  const notifications = { recordTeamEvent: jest.fn() };
  const audit = { record: jest.fn() };
  const mail = {} as never;

  function makeService(prisma: Record<string, unknown>) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access.jwt'),
    } as unknown as JwtService;
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'JWT_ACCESS_TTL') return '900';
        if (key === 'JWT_REFRESH_TTL') return '604800';
        return fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    return new AuthService(
      prisma as never,
      jwt,
      config,
      notifications as never,
      audit as never,
      mail,
    );
  }

  const rawToken = 'a'.repeat(43);
  const tokenHash = hashToken(rawToken);

  const membershipRow = {
    id: 'mem_1',
    shopId: 'shop_1',
    userId: 'staff_1',
    role: ShopRole.STAFF,
    permissions: 'menu.read,reservation.read',
    isActive: true,
    inviteTokenHash: tokenHash,
    inviteExpiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 'staff_1',
      email: 'alice.arcade@locora.local',
      name: 'Alice',
      accountType: UserAccountType.VENUE_STAFF,
      passwordSetAt: null,
    },
  };

  const shopWithSeats = (staffSeatQuantity: number, addOns = 'team_accounts') => ({
    id: 'shop_1',
    subscription: {
      tier: SubscriptionTier.STARTER,
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
      packId: 'gaming',
      addOnRows: addOns
        ? addOns.split(',').filter(Boolean).map((addOnId) => ({ addOnId }))
        : [],
      staffSeatQuantity,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consumes invite and issues tokens (rows already written at invite)', async () => {
    const findFirst = jest.fn().mockResolvedValue(membershipRow);
    const shopFindUnique = jest.fn().mockResolvedValue(shopWithSeats(2));
    const count = jest.fn().mockResolvedValue(1);
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const membershipUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const sessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const userFindUnique = jest.fn().mockResolvedValue({
      id: 'staff_1',
      email: membershipRow.user.email,
      name: 'Alice',
      systemRole: 'USER',
      accountType: UserAccountType.VENUE_STAFF,
      memberships: [
        {
          shopId: 'shop_1',
          role: ShopRole.STAFF,
          isActive: true,
          permissionRows: [
            { permission: 'menu.read' },
            { permission: 'reservation.read' },
          ],
          shop: {
            id: 'shop_1',
            name: 'Arcade',
            slug: 'arcade',
            dashboardKey: 'dashkey12',
            subscription: shopWithSeats(2).subscription,
          },
        },
      ],
    });
    const sessionCreate = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'sess_1',
      ...data,
    }));

    const tx = {
      membership: {
        findFirst,
        count,
        updateMany: membershipUpdateMany,
      },
      shop: { findUnique: shopFindUnique },
      user: { updateMany: userUpdateMany },
      authSession: { updateMany: sessionUpdateMany },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      user: { findUnique: userFindUnique },
      authSession: {
        create: sessionCreate,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const svc = makeService(prisma);
    const result = await svc.activateStaffInvite(
      rawToken,
      'StrongPass1!',
      '127.0.0.1',
      'jest',
    );

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access.jwt',
        refreshToken: expect.any(String),
      }),
    );
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'staff_1',
          passwordSetAt: null,
        }),
      }),
    );
    expect(membershipUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'mem_1',
          inviteTokenHash: tokenHash,
          isActive: true,
        }),
        data: expect.objectContaining({
          inviteTokenHash: null,
          inviteExpiresAt: null,
        }),
      }),
    );
    expect(sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'staff_1',
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      }),
    });
    expect(audit.record).toHaveBeenCalled();
  });

  it('refuses when seat capacity no longer allows this employee', async () => {
    const findFirst = jest.fn().mockResolvedValue(membershipRow);
    const shopFindUnique = jest.fn().mockResolvedValue(shopWithSeats(0));
    const count = jest.fn().mockResolvedValue(1);
    const userUpdateMany = jest.fn();

    const tx = {
      membership: { findFirst, count, updateMany: jest.fn() },
      shop: { findUnique: shopFindUnique },
      user: { updateMany: userUpdateMany },
      membershipPermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      authSession: { updateMany: jest.fn() },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const svc = makeService(prisma);
    await expect(
      svc.activateStaffInvite(rawToken, 'StrongPass1!'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses reuse when invite already consumed (updateMany count 0)', async () => {
    const findFirst = jest.fn().mockResolvedValue(membershipRow);
    const shopFindUnique = jest.fn().mockResolvedValue(shopWithSeats(2));
    const count = jest.fn().mockResolvedValue(1);
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

    const tx = {
      membership: { findFirst, count, updateMany: jest.fn() },
      shop: { findUnique: shopFindUnique },
      user: { updateMany: userUpdateMany },
      membershipPermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      authSession: { updateMany: jest.fn() },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const svc = makeService(prisma);
    await expect(
      svc.activateStaffInvite(rawToken, 'StrongPass1!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
