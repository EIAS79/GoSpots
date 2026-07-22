import { NotFoundException } from '@nestjs/common';
import {
  EventRequestSource,
  EventRequestStatus,
  EventRequestType,
} from '@prisma/client';
import { EventRequestsService } from './event-requests.service';

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('EventRequestsService tenant-scoped mutations', () => {
  const audit = { record: jest.fn() };
  const notifications = { recordReservationEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const now = new Date('2030-06-15T12:00:00.000Z');

  const ownedPending = {
    id: 'ev_1',
    shopId: 'shop_a',
    eventType: EventRequestType.PARTY,
    source: EventRequestSource.PUBLIC,
    guestName: 'Alex Guest',
    guestEmail: 'alex@example.com',
    guestPhone: null,
    partySize: 8,
    preferredStartsAt: new Date('2030-06-15T14:00:00.000Z'),
    preferredEndsAt: new Date('2030-06-15T16:00:00.000Z'),
    zone: null,
    floor: null,
    message: null,
    status: EventRequestStatus.PENDING,
    staffResponseNote: null,
    reviewedAt: null,
    reviewedById: null,
    seatingTableGroupId: null,
    resourceCategoryId: 'cat_1',
    guestToken: null,
    guestTokenHash: 'hash',
    guestTokenExpiresAt: null,
    guestTokenRevokedAt: null,
    createdAt: now,
    updatedAt: now,
    resourceCategory: {
      id: 'cat_1',
      name: 'Party room',
      type: 'OTHER',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new EventRequestsService(
      prisma as never,
      audit as never,
      notifications as never,
    );
  }

  it('list scopes findMany + count to actor shopId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = makeService({
      eventRequest: { findMany, count },
    });

    await service.list(actor, {} as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: 'shop_a' }),
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { shopId: 'shop_a', status: EventRequestStatus.PENDING },
    });
  });

  it('review decline uses shopId in findFirst + update where', async () => {
    const update = jest.fn().mockResolvedValue({
      ...ownedPending,
      status: EventRequestStatus.DECLINED,
      staffResponseNote: 'Fully booked',
      reviewedAt: now,
      reviewedById: 'user_1',
    });
    const findFirst = jest.fn().mockResolvedValue(ownedPending);
    const service = makeService({
      eventRequest: { findFirst, update },
    });

    await service.review(actor, 'ev_1', {
      action: 'decline',
      staffResponseNote: 'Fully booked',
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'ev_1', shopId: 'shop_a' },
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev_1', shopId: 'shop_a' },
      }),
    );
  });

  it('review decline rejects Shop B request id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      eventRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(
      service.review(actor, 'ev_shop_b', {
        action: 'decline',
        staffResponseNote: 'Nope',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('review approve uses shopId in findFirst + update where', async () => {
    const update = jest.fn().mockResolvedValue({
      ...ownedPending,
      status: EventRequestStatus.APPROVED,
      reviewedAt: now,
      reviewedById: 'user_1',
    });
    const findFirst = jest.fn().mockResolvedValue(ownedPending);
    const service = makeService({
      eventRequest: { findFirst, update },
    });

    await service.review(actor, 'ev_1', {
      action: 'approve',
      createFloorBlock: false,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'ev_1', shopId: 'shop_a' },
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev_1', shopId: 'shop_a' },
        data: expect.objectContaining({
          status: EventRequestStatus.APPROVED,
        }),
      }),
    );
  });

  it('review approve rejects Shop B request id for Shop A actor', async () => {
    const update = jest.fn();
    const seatingCreate = jest.fn();
    const service = makeService({
      eventRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
      seatingTableGroup: { create: seatingCreate },
    });

    await expect(
      service.review(actor, 'ev_shop_b', {
        action: 'approve',
        createFloorBlock: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
    expect(seatingCreate).not.toHaveBeenCalled();
  });

  it('cancel uses shopId in findFirst + update where', async () => {
    const update = jest.fn().mockResolvedValue({
      ...ownedPending,
      status: EventRequestStatus.CANCELED,
    });
    const findFirst = jest.fn().mockResolvedValue(ownedPending);
    const service = makeService({
      eventRequest: { findFirst, update },
    });

    await service.cancel(actor, 'ev_1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'ev_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev_1', shopId: 'shop_a' },
      }),
    );
  });

  it('cancel rejects Shop B request id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      eventRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(service.cancel(actor, 'ev_shop_b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
