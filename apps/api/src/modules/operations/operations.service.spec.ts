import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperationsBillingMode, ResourceConfigurationState } from '@prisma/client';
import {
  calculateAccruedMinor,
  OperationsService,
  resolveApplicableRatePlan,
} from './operations.service';

const featureEnabledShop = {
  subscription: {
    tier: 'PRO',
    status: 'ACTIVE',
    trialEndsAt: null,
    packId: 'mixed',
    addOnRows: [],
    staffSeatQuantity: 0,
  },
};

describe('Resource Engine 2.0 billing snapshot math', () => {
  const startedAt = new Date('2026-08-11T10:00:00.000Z');

  it('removes paused time and rounds billable minutes', () => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T11:10:00.000Z'),
      totalPausedSeconds: 10 * 60,
      hourlyRateMinor: 4000,
      roundingMinutes: 15,
      minimumMinutes: 0,
    })).toBe(4000);
  });

  it('preserves minimum and cap rules in the rate snapshot', () => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T10:02:00.000Z'),
      totalPausedSeconds: 0,
      hourlyRateMinor: 6000,
      roundingMinutes: 1,
      minimumMinutes: 30,
      capMinor: 2000,
    })).toBe(2000);
  });

  it('uses overtime rate only after the snapshotted threshold', () => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T12:00:00.000Z'),
      totalPausedSeconds: 0,
      hourlyRateMinor: 3000,
      overtimeRateMinor: 6000,
      overtimeAfterMinutes: 60,
      roundingMinutes: 1,
      minimumMinutes: 0,
    })).toBe(9000);
  });

  it.each([
    [OperationsBillingMode.PER_MINUTE, { unitPriceMinor: 25 }, 250],
    [OperationsBillingMode.FIXED_PRICE, { unitPriceMinor: 1500 }, 1500],
    [OperationsBillingMode.FIXED_DURATION, { unitPriceMinor: 700, fixedDurationMinutes: 5 }, 1400],
    [OperationsBillingMode.PER_PERSON, { unitPriceMinor: 400, participantCount: 3 }, 1200],
    [OperationsBillingMode.PER_GAME, { unitPriceMinor: 250, gameCount: 4 }, 1000],
    [OperationsBillingMode.FREE, { unitPriceMinor: 9999 }, 0],
  ])('calculates %s without floating-point money', (billingMode, extra, expected) => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T10:10:00.000Z'),
      totalPausedSeconds: 0,
      hourlyRateMinor: 0,
      billingMode,
      roundingMinutes: 1,
      minimumMinutes: 0,
      ...extra,
    })).toBe(expected);
  });
});

describe('Phase 2 rate rule resolution', () => {
  const base = {
    resourceCategoryId: 'category-1',
    weekdays: [] as number[],
    startMinute: null,
    endMinute: null,
    holidayDates: [] as string[],
    membershipHookKey: null,
    membershipOnly: false,
    groupPackage: false,
    priority: 0,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('uses the previous schedule day for an overnight window', () => {
    const plan = {
      ...base,
      id: 'overnight',
      resourceId: null,
      weekdays: [1],
      startMinute: 22 * 60,
      endMinute: 2 * 60,
    };
    expect(resolveApplicableRatePlan([plan], {
      now: new Date('2026-01-13T00:30:00Z'),
      timeZone: 'Europe/Warsaw',
      resourceId: 'resource-1',
      resourceCategoryId: 'category-1',
      membershipKeys: [],
      groupActive: false,
    })?.id).toBe('overnight');
    expect(resolveApplicableRatePlan([plan], {
      now: new Date('2026-01-13T01:00:00Z'),
      timeZone: 'Europe/Warsaw',
      resourceId: 'resource-1',
      resourceCategoryId: 'category-1',
      membershipKeys: [],
      groupActive: false,
    })).toBeNull();
  });

  it('resolves a DST-transition instant in venue local time', () => {
    const plan = {
      ...base,
      id: 'dst',
      resourceId: null,
      weekdays: [0],
      startMinute: 3 * 60,
      endMinute: 4 * 60,
    };
    expect(resolveApplicableRatePlan([plan], {
      now: new Date('2026-03-29T01:30:00Z'),
      timeZone: 'Europe/Warsaw',
      resourceId: 'resource-1',
      resourceCategoryId: 'category-1',
      membershipKeys: [],
      groupActive: false,
    })?.id).toBe('dst');
  });

  it('prefers a resource override over its category default', () => {
    const category = { ...base, id: 'category', resourceId: null, priority: 99 };
    const resource = { ...base, id: 'resource', resourceId: 'resource-1', priority: 0 };
    expect(resolveApplicableRatePlan([category, resource], {
      now: new Date('2026-01-12T12:00:00Z'),
      timeZone: 'UTC',
      resourceId: 'resource-1',
      resourceCategoryId: 'category-1',
      membershipKeys: [],
      groupActive: false,
    })?.id).toBe('resource');
  });

  it('does not accept a membership-only rate without server-derived membership keys', () => {
    const memberRate = {
      ...base,
      id: 'member',
      resourceId: null,
      membershipOnly: true,
      membershipHookKey: 'GOLD',
    };
    expect(resolveApplicableRatePlan([memberRate], {
      now: new Date('2026-01-12T12:00:00Z'),
      timeZone: 'UTC',
      resourceId: 'resource-1',
      resourceCategoryId: 'category-1',
      membershipKeys: [],
      groupActive: false,
    })).toBeNull();
    expect(resolveApplicableRatePlan([memberRate], {
      now: new Date('2026-01-12T12:00:00Z'),
      timeZone: 'UTC',
      resourceId: 'resource-1',
      resourceCategoryId: 'category-1',
      membershipKeys: ['ACTIVE', 'GOLD'],
      groupActive: false,
    })?.id).toBe('member');
  });
});

describe('OperationsService optimistic concurrency', () => {
  it('rejects a stale session command before applying the versioned update', async () => {
    const session = {
      id: 'session-1',
      shopId: 'shop-1',
      resourceId: 'resource-1',
      status: 'ACTIVE',
      version: 2,
    };
    const tx = {
      operationsSessionPause: { create: jest.fn() },
      operationsSession: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
      },
      resourceStateEvent: { create: jest.fn() },
    };
    const prisma = {
      operationsSession: { findFirst: jest.fn().mockResolvedValue(session) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OperationsService(prisma as never, {
      record: jest.fn(),
    } as never);

    await expect(
      service.pause(
        { sub: 'user-1', shopId: 'shop-1' } as never,
        session.id,
        { reason: 'stale command', expectedVersion: 1 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.operationsSession.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ResourceConfigurationState.DISABLED,
    ResourceConfigurationState.MAINTENANCE,
    ResourceConfigurationState.OFFLINE_DEVICE,
  ])('does not start a session for a %s resource', async (configurationState) => {
    const tx = {
      $executeRaw: jest.fn(),
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'resource-1',
          shopId: 'shop-1',
          categoryId: 'category-1',
          configurationState,
        }),
      },
    };
    const prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue(featureEnabledShop) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OperationsService(prisma as never, { record: jest.fn() } as never);
    await expect(service.start(
      { sub: 'user-1', shopId: 'shop-1' } as never,
      { resourceId: 'resource-1' },
    )).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('OperationsService tenant-scoped rate targets', () => {
  it('does not let an owner bypass a disabled resource capability', async () => {
    const prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue({ subscription: null }) },
      resource: { findFirst: jest.fn() },
    };
    const service = new OperationsService(prisma as never, { record: jest.fn() } as never);
    await expect(service.createRatePlan(
      { sub: 'owner-1', shopId: 'shop-1', perms: '*' } as never,
      {
        name: 'Forbidden rate',
        resourceId: 'resource-1',
        billingMode: OperationsBillingMode.HOURLY,
        hourlyRateMinor: 1000,
      },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.resource.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a valid resource id owned by another venue', async () => {
    const prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue(featureEnabledShop) },
      resource: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new OperationsService(prisma as never, { record: jest.fn() } as never);
    await expect(service.createRatePlan(
      { sub: 'owner-1', shopId: 'shop-1' } as never,
      {
        name: 'Cross tenant override',
        resourceId: 'resource-in-shop-2',
        billingMode: OperationsBillingMode.HOURLY,
        hourlyRateMinor: 1000,
      },
    )).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.resource.findFirst).toHaveBeenCalledWith({
      where: { id: 'resource-in-shop-2', shopId: 'shop-1' },
      select: { id: true },
    });
  });
});
