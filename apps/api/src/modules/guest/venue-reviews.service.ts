import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiForbiddenException } from '../../common/api-error.util';
import { ShopReviewsMode, VenueReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireShopId } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { assertShopHasFeature } from '../../common/venue-entitlements';
import {
  assertPrivacyConsentAccepted,
  recordConsent,
} from '../../common/gdpr-consent.util';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreatePublicReviewDto } from './dto/guest.dto';

export type ReviewSort = 'date' | 'rating';
export type ReviewOrder = 'asc' | 'desc';

@Injectable()
export class VenueReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private assertRead(actor: JwtAccessPayload) {
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.REVIEWS_READ)) {
      throw apiForbiddenException(
        ApiDomainErrorCode.PERMISSION_DENIED,
        'Missing reviews.read permission.',
        { permission: PERMISSIONS.REVIEWS_READ },
      );
    }
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.REVIEWS_WRITE)) {
      throw apiForbiddenException(
        ApiDomainErrorCode.PERMISSION_DENIED,
        'Missing reviews.write permission.',
        { permission: PERMISSIONS.REVIEWS_WRITE },
      );
    }
  }

  async listPublished(
    slug: string,
    opts: {
      take?: number;
      sort?: ReviewSort;
      order?: ReviewOrder;
    } = {},
  ) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, reviewsMode: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    const mode = shop.reviewsMode;
    const showPublic = mode === ShopReviewsMode.ENABLED;
    const canSubmit =
      mode === ShopReviewsMode.ENABLED || mode === ShopReviewsMode.HIDDEN;

    if (!showPublic) {
      return {
        reviewsMode: mode,
        canSubmit,
        showReviews: false,
        averageRating: null,
        reviewCount: 0,
        reviews: [],
      };
    }

    const take = Math.min(Math.max(opts.take ?? 12, 1), 100);
    const sort = opts.sort === 'rating' ? 'rating' : 'date';
    const order = opts.order === 'asc' ? 'asc' : 'desc';
    const orderBy =
      sort === 'rating'
        ? [{ rating: order as 'asc' | 'desc' }, { createdAt: 'desc' as const }]
        : [{ createdAt: order as 'asc' | 'desc' }];

    const [reviews, agg] = await Promise.all([
      this.prisma.venueReview.findMany({
        where: { shopId: shop.id, status: VenueReviewStatus.PUBLISHED },
        orderBy,
        take,
        select: {
          id: true,
          guestName: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      }),
      this.prisma.venueReview.aggregate({
        where: { shopId: shop.id, status: VenueReviewStatus.PUBLISHED },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      reviewsMode: mode,
      canSubmit,
      showReviews: true,
      averageRating: agg._avg.rating
        ? Math.round(agg._avg.rating * 10) / 10
        : null,
      reviewCount: agg._count.rating,
      reviews: reviews.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async createFromPublic(slug: string, dto: CreatePublicReviewDto) {
    assertPrivacyConsentAccepted(dto.privacyConsentAccepted);

    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, reviewsMode: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    if (shop.reviewsMode === ShopReviewsMode.DISABLED) {
      throw new BadRequestException(
        'This venue is not accepting reviews right now.',
      );
    }

    const hidden = shop.reviewsMode === ShopReviewsMode.HIDDEN;

    const row = await this.prisma.venueReview.create({
      data: {
        shopId: shop.id,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        status: VenueReviewStatus.PENDING,
      },
    });

    await this.audit.recordForShop(shop.id, {
      section: 'venue',
      action: 'review.create_public',
      summary: `${row.guestName} left a ${row.rating}/5 review`,
      meta: { reviewId: row.id, rating: row.rating, hidden },
    });

    await recordConsent(this.prisma, {
      shopId: shop.id,
      purpose: 'REVIEW',
      guestEmail: row.guestEmail,
      sourceEntityType: 'venueReview',
      sourceEntityId: row.id,
    });

    await this.notifications.recordTeamEvent(shop.id, {
      title: 'New guest review',
      body: `${row.guestName} rated ${row.rating}/5 — awaiting moderation`,
      href: '/reviews',
      dedupeKey: `review:${row.id}`,
    });

    return {
      ok: true,
      message:
        'Thank you! Your review was received and is awaiting moderation.',
      id: row.id,
      publicVisible: false,
    };
  }

  async listForShop(
    actor: JwtAccessPayload,
    opts: { status?: VenueReviewStatus; take?: number; skip?: number } = {},
  ) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'reviews');
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const skip = Math.max(opts.skip ?? 0, 0);

    const where = {
      shopId,
      ...(opts.status ? { status: opts.status } : {}),
    };

    const [reviews, total, publishedAgg] = await Promise.all([
      this.prisma.venueReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.venueReview.count({ where }),
      this.prisma.venueReview.aggregate({
        where: { shopId, status: VenueReviewStatus.PUBLISHED },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      total,
      averageRating: publishedAgg._avg.rating
        ? Math.round(publishedAgg._avg.rating * 10) / 10
        : null,
      publishedCount: publishedAgg._count.rating,
      reviews: reviews.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async updateStatus(
    actor: JwtAccessPayload,
    id: string,
    status: VenueReviewStatus,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'reviews');
    if (
      status !== VenueReviewStatus.PUBLISHED &&
      status !== VenueReviewStatus.REJECTED &&
      status !== VenueReviewStatus.PENDING
    ) {
      throw new BadRequestException('Invalid review status.');
    }

    const existing = await this.prisma.venueReview.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException('Review not found.');

    const row = await this.prisma.venueReview.update({
      where: { id, shopId },
      data: { status },
    });

    await this.audit.record(actor, {
      section: 'venue',
      action: 'review.update_status',
      summary: `Set review by ${existing.guestName} to ${status}`,
      meta: { reviewId: id, status, rating: existing.rating },
    });

    return {
      id: row.id,
      status: row.status,
      guestName: row.guestName,
      guestEmail: row.guestEmail,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async remove(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'reviews');
    const existing = await this.prisma.venueReview.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException('Review not found.');

    await this.prisma.venueReview.delete({ where: { id, shopId } });

    await this.audit.record(actor, {
      section: 'venue',
      action: 'review.delete',
      summary: `Deleted review by ${existing.guestName} (${existing.rating}/5)`,
      meta: { reviewId: id, rating: existing.rating },
    });

    return { ok: true };
  }

  async statsByShopIds(shopIds: string[]) {
    if (!shopIds.length) {
      return new Map<
        string,
        { averageRating: number | null; reviewCount: number }
      >();
    }

    const enabled = await this.prisma.shop.findMany({
      where: {
        id: { in: shopIds },
        reviewsMode: ShopReviewsMode.ENABLED,
      },
      select: { id: true },
    });
    const enabledIds = enabled.map((s) => s.id);
    if (!enabledIds.length) {
      return new Map();
    }

    const rows = await this.prisma.venueReview.groupBy({
      by: ['shopId'],
      where: {
        shopId: { in: enabledIds },
        status: VenueReviewStatus.PUBLISHED,
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const map = new Map<
      string,
      { averageRating: number | null; reviewCount: number }
    >();
    for (const row of rows) {
      map.set(row.shopId, {
        averageRating: row._avg.rating
          ? Math.round(row._avg.rating * 10) / 10
          : null,
        reviewCount: row._count.rating,
      });
    }
    return map;
  }
}
