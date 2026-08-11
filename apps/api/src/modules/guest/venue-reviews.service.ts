import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShopReviewsMode, VenueReviewStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiForbiddenException } from '../../common/api-error.util';
import {
  assertPrivacyConsentAccepted,
  recordConsent,
} from '../../common/gdpr-consent.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { assertShopHasFeature } from '../../common/venue-entitlements';
import { PrismaService } from '../../prisma/prisma.service';
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
        ? [
            { rating: order as 'asc' | 'desc' },
            { createdAt: 'desc' as const },
          ]
        : [{ createdAt: order as 'asc' | 'desc' }];

    const [reviews, aggregate] = await Promise.all([
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
    const verifiedIds = await this.verifiedReviewIds(
      shop.id,
      reviews.map((review) => review.id),
    );

    return {
      reviewsMode: mode,
      canSubmit,
      showReviews: true,
      averageRating: aggregate._avg.rating
        ? Math.round(aggregate._avg.rating * 10) / 10
        : null,
      reviewCount: aggregate._count.rating,
      reviews: reviews.map((review) => ({
        ...review,
        verifiedVisit: verifiedIds.has(review.id),
        createdAt: review.createdAt.toISOString(),
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
    const tokenHash = dto.visitProofToken
      ? createHash('sha256').update(dto.visitProofToken.trim()).digest('hex')
      : null;
    const proof = tokenHash
      ? await this.prisma.reviewVisitProof.findFirst({
          where: {
            shopId: shop.id,
            publicTokenHash: tokenHash,
            consumedAt: null,
            OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
          },
        })
      : null;
    if (dto.visitProofToken && !proof) {
      throw new BadRequestException(
        'The verified-visit proof is invalid, expired, or already used.',
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const review = await tx.venueReview.create({
        data: {
          shopId: shop.id,
          guestName: dto.guestName.trim(),
          guestEmail: dto.guestEmail?.trim() || null,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
          status: VenueReviewStatus.PENDING,
        },
      });
      if (proof) {
        const consumed = await tx.reviewVisitProof.updateMany({
          where: {
            id: proof.id,
            shopId: shop.id,
            consumedAt: null,
            reviewId: null,
            OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
          },
          data: {
            consumedAt: new Date(),
            reviewId: review.id,
          },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException(
            'The verified-visit proof was already used.',
          );
        }
      }
      return review;
    });

    await this.audit.recordForShop(shop.id, {
      section: 'venue',
      action: 'review.create_public',
      summary: `${row.guestName} left a ${row.rating}/5 review`,
      meta: {
        reviewId: row.id,
        rating: row.rating,
        hidden,
        verifiedVisit: Boolean(proof),
      },
    });

    await recordConsent(this.prisma, {
      shopId: shop.id,
      purpose: 'REVIEW',
      guestEmail: row.guestEmail,
      sourceEntityType: 'venueReview',
      sourceEntityId: row.id,
    });

    await this.notifications.recordTeamEvent(shop.id, {
      title: proof ? 'New verified-visit review' : 'New guest review',
      body: `${row.guestName} rated ${row.rating}/5 — awaiting moderation`,
      href: '/reviews',
      dedupeKey: `review:${row.id}`,
    });

    return {
      ok: true,
      message:
        'Thank you! Your review was received and is awaiting moderation.',
      id: row.id,
      verifiedVisit: Boolean(proof),
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

    const [reviews, total, publishedAggregate] = await Promise.all([
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
    const verifiedIds = await this.verifiedReviewIds(
      shopId,
      reviews.map((review) => review.id),
    );

    return {
      total,
      averageRating: publishedAggregate._avg.rating
        ? Math.round(publishedAggregate._avg.rating * 10) / 10
        : null,
      publishedCount: publishedAggregate._count.rating,
      reviews: reviews.map((review) => ({
        id: review.id,
        guestName: review.guestName,
        guestEmail: review.guestEmail,
        rating: review.rating,
        comment: review.comment,
        status: review.status,
        verifiedVisit: verifiedIds.has(review.id),
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
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
    const verifiedIds = await this.verifiedReviewIds(shopId, [row.id]);

    await this.audit.record(actor, {
      section: 'venue',
      action: 'review.update_status',
      summary: `Set review by ${existing.guestName} to ${status}`,
      meta: {
        reviewId: id,
        status,
        rating: existing.rating,
        verifiedVisit: verifiedIds.has(row.id),
      },
    });

    return {
      id: row.id,
      status: row.status,
      guestName: row.guestName,
      guestEmail: row.guestEmail,
      rating: row.rating,
      comment: row.comment,
      verifiedVisit: verifiedIds.has(row.id),
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
    const enabledIds = enabled.map((shop) => shop.id);
    if (!enabledIds.length) return new Map();

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

  private async verifiedReviewIds(shopId: string, reviewIds: string[]) {
    if (reviewIds.length === 0) return new Set<string>();
    const proofs = await this.prisma.reviewVisitProof.findMany({
      where: {
        shopId,
        reviewId: { in: reviewIds },
        consumedAt: { not: null },
      },
      select: { reviewId: true },
    });
    return new Set(
      proofs.flatMap((proof) => (proof.reviewId ? [proof.reviewId] : [])),
    );
  }
}
