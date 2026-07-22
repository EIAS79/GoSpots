import { ReservationStatus, ResourceStatus } from '@prisma/client';
import {
  AUTO_NO_SHOW_FROM_STATUSES,
  ReservationRemindersService,
} from './reservation-reminders.service';

describe('ReservationRemindersService auto NO_SHOW', () => {
  const notifications = {
    recordReservationEvent: jest.fn().mockResolvedValue(undefined),
  };
  const audit = {
    recordForShop: jest.fn().mockResolvedValue(undefined),
  };

  function makeService(prisma: Record<string, unknown>) {
    return new ReservationRemindersService(
      prisma as never,
      notifications as never,
      audit as never,
    );
  }

  async function runAutoNoShow(svc: ReservationRemindersService) {
    await (
      svc as unknown as { autoNoShowSessions: () => Promise<void> }
    ).autoNoShowSessions();
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AUTO_NO_SHOW_FROM_STATUSES is only CONFIRMED and PENDING', () => {
    expect([...AUTO_NO_SHOW_FROM_STATUSES]).toEqual([
      ReservationStatus.CONFIRMED,
      ReservationStatus.PENDING,
    ]);
  });

  it('conditional updateMany sets NO_SHOW and revokes guest token together', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue(null);
    const resourceUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'resv_1',
        shopId: 'shop_1',
        resourceId: 'unit_1',
        guestName: 'Alex',
        startsAt: new Date('2026-07-20T12:00:00Z'),
        resource: { type: 'TABLE', name: 'T1' },
      },
    ]);

    const svc = makeService({
      reservation: { findMany, updateMany, findFirst },
      resource: { updateMany: resourceUpdateMany },
    });

    await runAutoNoShow(svc);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 'resv_1',
      status: { in: [...AUTO_NO_SHOW_FROM_STATUSES] },
    });
    expect(arg.data.status).toBe(ReservationStatus.NO_SHOW);
    expect(arg.data.guestToken).toBeNull();
    expect(arg.data.guestTokenRevokedAt).toBeInstanceOf(Date);

    expect(resourceUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'unit_1',
        status: { not: ResourceStatus.MAINTENANCE },
      },
      data: { status: ResourceStatus.AVAILABLE },
    });
    expect(audit.recordForShop).toHaveBeenCalledTimes(1);
    expect(notifications.recordReservationEvent).toHaveBeenCalledWith(
      'shop_1',
      expect.objectContaining({ dedupeKey: 'auto_no_show:resv_1' }),
    );
  });

  it('double-run safe: count 0 skips free-unit, audit, and notify', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findFirst = jest.fn();
    const resourceUpdateMany = jest.fn();
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'resv_1',
        shopId: 'shop_1',
        resourceId: 'unit_1',
        guestName: 'Alex',
        startsAt: new Date('2026-07-20T12:00:00Z'),
        resource: { type: 'TABLE', name: 'T1' },
      },
    ]);

    const svc = makeService({
      reservation: { findMany, updateMany, findFirst },
      resource: { updateMany: resourceUpdateMany },
    });

    await runAutoNoShow(svc);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
    expect(resourceUpdateMany).not.toHaveBeenCalled();
    expect(audit.recordForShop).not.toHaveBeenCalled();
    expect(notifications.recordReservationEvent).not.toHaveBeenCalled();
  });
});

describe('ReservationRemindersService tick single-flight', () => {
  const notifications = {
    recordReservationEvent: jest.fn().mockResolvedValue(undefined),
  };
  const audit = {
    recordForShop: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function emptyTickPrisma(acquired: boolean) {
    const findMany = jest.fn().mockResolvedValue([]);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired }]),
    };
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      reservation: { findMany },
      resource: { updateMany: jest.fn() },
      __findMany: findMany,
      __tx: tx,
    };
  }

  it('runs reminder queries when advisory lock is acquired', async () => {
    const prisma = emptyTickPrisma(true);
    const svc = new ReservationRemindersService(
      prisma as never,
      notifications as never,
      audit as never,
    );

    await svc.tick();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.__tx.$queryRaw).toHaveBeenCalled();
    // Four tick workers each call reservation.findMany (or short-circuit).
    expect(prisma.__findMany.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('skips all tick work when another instance holds the lock', async () => {
    const prisma = emptyTickPrisma(false);
    const svc = new ReservationRemindersService(
      prisma as never,
      notifications as never,
      audit as never,
    );

    await svc.tick();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.__findMany).not.toHaveBeenCalled();
    expect(notifications.recordReservationEvent).not.toHaveBeenCalled();
  });
});
