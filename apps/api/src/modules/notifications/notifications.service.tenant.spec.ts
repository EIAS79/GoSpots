import { NotificationsService } from './notifications.service';
import { NotificationsSseHub } from './notifications-sse.hub';

describe('NotificationsService tenant-scoped mutations', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const sseHub = new NotificationsSseHub();

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    sysRole: 'USER',
    email: 'owner@example.com',
    perms: '*',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('markRead uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'n_1',
      shopId: 'shop_a',
      type: 'SYSTEM',
      section: 'system',
      title: 't',
      body: 'b',
      href: null,
      readAt: new Date(),
      archivedAt: null,
      createdAt: new Date(),
    });
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'n_1',
          shopId: 'shop_a',
          userId: null,
        }),
        update,
      },
    };
    const service = new NotificationsService(
      prisma as never,
      audit as never,
      sseHub,
    );

    await service.markRead(actor, 'n_1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n_1', shopId: 'shop_a' },
      }),
    );
  });

  it('markUnread uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'n_1',
      shopId: 'shop_a',
      type: 'SYSTEM',
      section: 'system',
      title: 't',
      body: 'b',
      href: null,
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    });
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'n_1',
          shopId: 'shop_a',
          userId: null,
        }),
        update,
      },
    };
    const service = new NotificationsService(
      prisma as never,
      audit as never,
      sseHub,
    );

    await service.markUnread(actor, 'n_1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n_1', shopId: 'shop_a' },
      }),
    );
  });

  it('markReservationTabRead updateMany includes shopId and tab filter without prefetch', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      notification: {
        updateMany,
      },
    };
    const service = new NotificationsService(
      prisma as never,
      audit as never,
      sseHub,
    );

    await service.markReservationTabRead(actor, { tab: 'dining' });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 'shop_a',
          section: 'reservation',
          readAt: null,
          AND: expect.arrayContaining([
            {
              OR: [{ userId: null }, { userId: 'user_1' }],
            },
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
        data: { readAt: expect.any(Date) },
      }),
    );
    expect(prisma.notification).not.toHaveProperty('findMany');
  });

  it('reservationBadges uses count queries instead of findMany', async () => {
    const count = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    const prisma = {
      notification: { count },
    };
    const service = new NotificationsService(
      prisma as never,
      audit as never,
      sseHub,
    );

    const result = await service.reservationBadges(actor);

    expect(count).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ dining: 2, gaming: 3, events: 1, total: 6 });
    expect(prisma.notification).not.toHaveProperty('findMany');
  });

  it('archive by ids scopes to shopId', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      notification: { updateMany },
    };
    const service = new NotificationsService(
      prisma as never,
      audit as never,
      sseHub,
    );

    await service.archive(actor, { ids: ['n_1'] });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 'shop_a',
          id: { in: ['n_1'] },
        }),
      }),
    );
  });

  it('removeMany by ids scopes to shopId', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      notification: { deleteMany },
    };
    const service = new NotificationsService(
      prisma as never,
      audit as never,
      sseHub,
    );

    await service.removeMany(actor, { ids: ['n_1'] });

    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        shopId: 'shop_a',
        id: { in: ['n_1'] },
      }),
    });
  });
});
