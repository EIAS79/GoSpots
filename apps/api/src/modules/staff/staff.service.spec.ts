import { ForbiddenException } from '@nestjs/common';
import { ShopRole, SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { StaffService } from './staff.service';

describe('StaffService seat enforcement', () => {
  const audit = { record: jest.fn() };
  const notifications = { recordTeamEvent: jest.fn() };

  function makeService(prisma: Record<string, unknown>) {
    return new StaffService(
      prisma as never,
      audit as never,
      notifications as never,
    );
  }

  const owner = {
    sub: 'owner_1',
    sysRole: 'USER' as const,
    email: 'owner@example.com',
    shopId: 'shop_1',
    shopRole: 'OWNER' as const,
  };

  function shopWithSeats(staffSeatQuantity: number, addOns = 'team_accounts') {
    return {
      id: 'shop_1',
      slug: 'arcade',
      subscription: {
        tier: SubscriptionTier.STARTER,
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        packId: 'gaming',
        // Rows-primary: empty addOnRows would wipe CSV fallback.
        addOnRows: addOns
          ? addOns.split(',').filter(Boolean).map((addOnId) => ({ addOnId }))
          : [],
        staffSeatQuantity,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create throws 403 when seat cap reached', async () => {
    const prisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue(shopWithSeats(1)),
      },
      membership: {
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    const svc = makeService(prisma);

    await expect(
      svc.create(owner, { username: 'alice' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(svc.create(owner, { username: 'alice' })).rejects.toThrow(
      /Employee limit reached \(1\/1\)/,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('update reactivate throws 403 when no free seat', async () => {
    const prisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue(shopWithSeats(2)),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mem_inactive',
          shopId: 'shop_1',
          role: ShopRole.STAFF,
          isActive: false,
          userId: 'staff_1',
          user: {
            id: 'staff_1',
            email: 'alice.arcade@locora.local',
            name: 'Alice',
            staffHandle: 'alice',
          },
          permissionRows: [],
        }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn(),
      },
    };
    const svc = makeService(prisma);

    await expect(
      svc.update(owner, 'mem_inactive', { isActive: true }),
    ).rejects.toThrow(/Employee limit reached \(2\/2\)/);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });
});
