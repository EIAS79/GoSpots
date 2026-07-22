import { ForbiddenException } from '@nestjs/common';
import { VenueReviewStatus } from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { PERMISSIONS } from '../../common/permissions';
import { VenueReviewsService } from './venue-reviews.service';

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

function expectForbiddenWithCode(err: unknown, code: string) {
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({ code });
}

describe('VenueReviewsService permission domain codes', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const notifications = { recordTeamEvent: jest.fn() };

  const actorBase = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
  } as never;

  function makeService() {
    return new VenueReviewsService(
      {
        venueReview: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockResolvedValue({
            _avg: { rating: null },
            _count: { rating: 0 },
          }),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          delete: jest.fn(),
        },
      } as never,
      notifications as never,
      audit as never,
    );
  }

  it('throws PERMISSION_DENIED with permission detail on reviews.read miss', async () => {
    const service = makeService();
    try {
      await service.listForShop(
        { ...actorBase, perms: PERMISSIONS.REVIEWS_WRITE } as never,
        {},
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        message: 'Missing reviews.read permission.',
        details: { permission: PERMISSIONS.REVIEWS_READ },
      });
    }
  });

  it('throws PERMISSION_DENIED with permission detail on reviews.write miss (updateStatus)', async () => {
    const service = makeService();
    try {
      await service.updateStatus(
        { ...actorBase, perms: PERMISSIONS.REVIEWS_READ } as never,
        'rev_1',
        VenueReviewStatus.PUBLISHED,
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        message: 'Missing reviews.write permission.',
        details: { permission: PERMISSIONS.REVIEWS_WRITE },
      });
    }
  });

  it('throws PERMISSION_DENIED with permission detail on reviews.write miss (remove)', async () => {
    const service = makeService();
    try {
      await service.remove(
        { ...actorBase, perms: PERMISSIONS.REVIEWS_READ } as never,
        'rev_1',
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        message: 'Missing reviews.write permission.',
        details: { permission: PERMISSIONS.REVIEWS_WRITE },
      });
    }
  });
});
