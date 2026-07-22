import { NotFoundException } from '@nestjs/common';
import { VenueReviewStatus } from '@prisma/client';
import { VenueReviewsService } from './venue-reviews.service';

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('VenueReviewsService tenant-scoped mutations', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const notifications = { recordTeamEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const now = new Date('2030-06-15T12:00:00.000Z');

  const ownedReview = {
    id: 'rev_1',
    shopId: 'shop_a',
    guestName: 'Alex Guest',
    guestEmail: 'alex@example.com',
    rating: 5,
    comment: 'Great tables',
    status: VenueReviewStatus.PENDING,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new VenueReviewsService(
      prisma as never,
      notifications as never,
      audit as never,
    );
  }

  it('listForShop scopes findMany + count to actor shopId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const aggregate = jest.fn().mockResolvedValue({
      _avg: { rating: null },
      _count: { rating: 0 },
    });
    const service = makeService({
      venueReview: { findMany, count, aggregate },
    });

    await service.listForShop(actor, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_a' },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { shopId: 'shop_a' } });
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_a', status: VenueReviewStatus.PUBLISHED },
      }),
    );
  });

  it('updateStatus uses shopId in findFirst + update where', async () => {
    const update = jest.fn().mockResolvedValue({
      ...ownedReview,
      status: VenueReviewStatus.PUBLISHED,
    });
    const findFirst = jest.fn().mockResolvedValue(ownedReview);
    const service = makeService({
      venueReview: { findFirst, update },
    });

    await service.updateStatus(actor, 'rev_1', VenueReviewStatus.PUBLISHED);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'rev_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rev_1', shopId: 'shop_a' },
        data: { status: VenueReviewStatus.PUBLISHED },
      }),
    );
  });

  it('updateStatus rejects Shop B review id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      venueReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(
      service.updateStatus(actor, 'rev_shop_b', VenueReviewStatus.REJECTED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('remove uses shopId in findFirst + delete where', async () => {
    const del = jest.fn().mockResolvedValue(ownedReview);
    const findFirst = jest.fn().mockResolvedValue(ownedReview);
    const service = makeService({
      venueReview: { findFirst, delete: del },
    });

    await service.remove(actor, 'rev_1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'rev_1', shopId: 'shop_a' },
    });
    expect(del).toHaveBeenCalledWith({
      where: { id: 'rev_1', shopId: 'shop_a' },
    });
  });

  it('remove rejects Shop B review id for Shop A actor', async () => {
    const del = jest.fn();
    const service = makeService({
      venueReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: del,
      },
    });

    await expect(service.remove(actor, 'rev_shop_b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(del).not.toHaveBeenCalled();
  });
});
