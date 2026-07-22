import { NotFoundException } from '@nestjs/common';
import { ShopRole } from '@prisma/client';
import { StaffService } from './staff.service';

describe('StaffService tenant-scoped mutations', () => {
  const audit = { record: jest.fn() };
  const notifications = { recordTeamEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    sysRole: 'USER',
    email: 'owner@example.com',
    perms: '*',
  } as never;

  const ownedMembership = {
    id: 'mem_1',
    shopId: 'shop_a',
    userId: 'staff_1',
    role: ShopRole.STAFF,
    isActive: true,
    user: {
      id: 'staff_1',
      email: 'alice.arcade@locora.local',
      name: 'Alice',
      staffHandle: 'alice',
      accountType: 'VENUE_STAFF',
    },
    permissionRows: [] as { permission: string }[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new StaffService(
      prisma as never,
      audit as never,
      notifications as never,
    );
  }

  it('update uses shopId in membership findFirst where', async () => {
    const membershipUpdate = jest.fn().mockResolvedValue({
      ...ownedMembership,
      role: ShopRole.STAFF,
      isActive: true,
      user: {
        id: 'staff_1',
        email: ownedMembership.user.email,
        name: 'Alice',
        staffHandle: 'alice',
      },
    });
    const findFirst = jest.fn().mockResolvedValue(ownedMembership);
    const prisma = {
      membership: { findFirst },
      user: { update: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          membership: { update: membershipUpdate },
        }),
      ),
    };
    const service = makeService(prisma);

    await service.update(actor, 'mem_1', { name: 'Alice A' });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'mem_1',
          shopId: 'shop_a',
          user: { accountType: 'VENUE_STAFF' },
        },
      }),
    );
    expect(membershipUpdate).toHaveBeenCalled();
  });

  it('update rejects Shop B membership id for Shop A actor', async () => {
    const membershipUpdate = jest.fn();
    const $transaction = jest.fn();
    const service = makeService({
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: membershipUpdate,
      },
      $transaction,
    });

    await expect(
      service.update(actor, 'mem_shop_b', { name: 'Hijack' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect($transaction).not.toHaveBeenCalled();
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it('remove uses shopId in membership findFirst where', async () => {
    const membershipDelete = jest.fn().mockResolvedValue({ id: 'mem_1' });
    const userDelete = jest.fn().mockResolvedValue({ id: 'staff_1' });
    const authSessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findFirst = jest.fn().mockResolvedValue(ownedMembership);
    const prisma = {
      membership: { findFirst },
      user: {
        findUnique: jest.fn().mockResolvedValue({ email: ownedMembership.user.email }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          authSession: { updateMany: authSessionUpdateMany },
          membership: { delete: membershipDelete },
          user: { delete: userDelete },
        }),
      ),
    };
    const service = makeService(prisma);

    await service.remove(actor, 'mem_1');

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'mem_1',
        shopId: 'shop_a',
        user: { accountType: 'VENUE_STAFF' },
      },
    });
    expect(membershipDelete).toHaveBeenCalledWith({
      where: { id: 'mem_1' },
    });
  });

  it('remove rejects Shop B membership id for Shop A actor', async () => {
    const membershipDelete = jest.fn();
    const $transaction = jest.fn();
    const service = makeService({
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: membershipDelete,
      },
      user: { findUnique: jest.fn(), delete: jest.fn() },
      $transaction,
    });

    await expect(service.remove(actor, 'mem_shop_b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect($transaction).not.toHaveBeenCalled();
    expect(membershipDelete).not.toHaveBeenCalled();
  });

  it('regenerateInvite uses shopId in membership findFirst where', async () => {
    const membershipUpdate = jest.fn().mockResolvedValue({ id: 'mem_1' });
    const findFirst = jest.fn().mockResolvedValue(ownedMembership);
    const prisma = {
      membership: { findFirst },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          authSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          membership: { update: membershipUpdate },
          user: { update: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };
    const service = makeService(prisma);

    await service.regenerateInvite(actor, 'mem_1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'mem_1',
          shopId: 'shop_a',
          user: { accountType: 'VENUE_STAFF' },
        },
      }),
    );
    expect(membershipUpdate).toHaveBeenCalled();
  });

  it('regenerateInvite rejects Shop B membership id for Shop A actor', async () => {
    const membershipUpdate = jest.fn();
    const $transaction = jest.fn();
    const service = makeService({
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: membershipUpdate,
      },
      $transaction,
    });

    await expect(
      service.regenerateInvite(actor, 'mem_shop_b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect($transaction).not.toHaveBeenCalled();
    expect(membershipUpdate).not.toHaveBeenCalled();
  });
});
