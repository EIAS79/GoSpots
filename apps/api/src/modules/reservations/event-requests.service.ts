import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventRequestSource,
  EventRequestStatus,
  EventRequestType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireShopId } from '../../common/tenant';
import { assertShopHasFeature } from '../../common/venue-entitlements';
import {
  assertPrivacyConsentAccepted,
  recordConsent,
} from '../../common/gdpr-consent.util';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreatePublicEventRequestDto,
  CreateStaffEventRequestDto,
  EventRequestQueryDto,
  ReviewEventRequestDto,
} from './dto/event-requests.dto';
import {
  assertGuestTokenActive,
  guestTokenLookupWhere,
  guestTokenNeedsRevoke,
  guestTokenPersistFields,
  guestTokenRevokeFields,
  issueGuestToken,
  verifyPresentedGuestToken,
} from '../../common/guest-token.util';
import { assertWithinOpeningHours } from '../../common/opening-hours.util';
import { guestVenueStatusPath } from '../../common/reservation-notification-href';

function parseDateRange(startsAt: string, endsAt?: string) {
  const preferredStartsAt = new Date(startsAt);
  const preferredEndsAt = endsAt ? new Date(endsAt) : null;
  if (Number.isNaN(preferredStartsAt.getTime())) {
    throw new BadRequestException('Invalid preferred start date/time.');
  }
  if (preferredEndsAt && Number.isNaN(preferredEndsAt.getTime())) {
    throw new BadRequestException('Invalid preferred end date/time.');
  }
  if (preferredEndsAt && preferredEndsAt <= preferredStartsAt) {
    throw new BadRequestException('End time must be after start time.');
  }
  return { preferredStartsAt, preferredEndsAt };
}

function eventTypeLabel(type: EventRequestType) {
  const labels: Record<EventRequestType, string> = {
    TABLE: 'Table booking',
    GAMING: 'Gaming booking',
    BIRTHDAY: 'Birthday',
    MEETING: 'Meeting',
    PARTY: 'Party',
    CORPORATE: 'Corporate',
    OTHER: 'Event',
  };
  return labels[type] ?? 'Event';
}

@Injectable()
export class EventRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private formatWindow(startsAt: Date, endsAt: Date | null) {
    const date = startsAt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const start = startsAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    if (!endsAt) return `${date} · ${start}`;
    const end = endsAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${date} · ${start}–${end}`;
  }

  private guestStatusPayload(row: {
    guestToken: string | null;
    guestTokenHash: string | null;
    status: EventRequestStatus;
    eventType: EventRequestType;
    guestName: string;
    preferredStartsAt: Date;
    preferredEndsAt: Date | null;
    staffResponseNote: string | null;
    reviewedAt: Date | null;
    partySize: number;
    zone: string | null;
    message: string | null;
    resourceCategory: { id: string; name: string; type: string } | null;
    shop: { slug: string; name: string };
  }) {
    if (!row.guestToken && !row.guestTokenHash) return null;
    const canCancel =
      row.status === EventRequestStatus.PENDING ||
      (row.status === EventRequestStatus.APPROVED &&
        row.preferredStartsAt.getTime() > Date.now());
    return {
      status: row.status,
      eventType: row.eventType,
      guestName: row.guestName,
      partySize: row.partySize,
      preferredStartsAt: row.preferredStartsAt.toISOString(),
      preferredEndsAt: row.preferredEndsAt?.toISOString() ?? null,
      zone: row.zone,
      message: row.message,
      resourceCategory: row.resourceCategory,
      staffResponseNote:
        row.status === EventRequestStatus.DECLINED ||
        row.status === EventRequestStatus.APPROVED
          ? row.staffResponseNote
          : null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      venueName: row.shop.name,
      venueSlug: row.shop.slug,
      canCancel,
    };
  }

  async getPublicStatus(slug: string, token: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    const row = await this.prisma.eventRequest.findFirst({
      where: guestTokenLookupWhere(shop.id, token),
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
    });
    if (!row || !verifyPresentedGuestToken(row, token)) {
      throw new NotFoundException('Request not found.');
    }
    assertGuestTokenActive(row);

    return this.guestStatusPayload({ ...row, shop });
  }

  async cancelFromPublic(slug: string, token: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    const existing = await this.prisma.eventRequest.findFirst({
      where: guestTokenLookupWhere(shop.id, token),
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
    });
    if (!existing || !verifyPresentedGuestToken(existing, token)) {
      throw new NotFoundException('Request not found.');
    }
    assertGuestTokenActive(existing);

    if (existing.status === EventRequestStatus.CANCELED) {
      // Legacy / race: canceled without revoke — seal once; reused revoked links fail above.
      if (guestTokenNeedsRevoke(existing)) {
        await this.prisma.eventRequest.update({
          where: { id: existing.id, shopId: shop.id },
          data: guestTokenRevokeFields(),
        });
      }
      return {
        ok: true,
        message: 'This request was already canceled.',
        status: existing.status,
      };
    }
    if (
      existing.status !== EventRequestStatus.PENDING &&
      existing.status !== EventRequestStatus.APPROVED
    ) {
      throw new BadRequestException(
        'This request can no longer be canceled online.',
      );
    }
    if (
      existing.status === EventRequestStatus.APPROVED &&
      existing.preferredStartsAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'This event has already started — contact the venue to change plans.',
      );
    }

    const seatingTableGroupId = existing.seatingTableGroupId;

    const row = await this.prisma.$transaction(async (tx) => {
      if (seatingTableGroupId) {
        await tx.seatingTableGroup.deleteMany({
          where: { id: seatingTableGroupId, shopId: shop.id, isCustom: true },
        });
      }
      return tx.eventRequest.update({
        where: { id: existing.id, shopId: shop.id },
        data: {
          status: EventRequestStatus.CANCELED,
          seatingTableGroupId: null,
          ...guestTokenRevokeFields(),
        },
        include: {
          resourceCategory: { select: { id: true, name: true, type: true } },
        },
      });
    });

    await this.audit.recordForShop(shop.id, {
      section: 'reservation',
      action: 'event_request.cancel_public',
      summary: `Guest ${existing.guestName} canceled ${eventTypeLabel(existing.eventType)} request`,
      meta: {
        requestId: existing.id,
        previousStatus: existing.status,
        seatingTableGroupId,
      },
    });

    await this.notifications.recordReservationEvent(shop.id, {
      title: 'Event request canceled by guest',
      body: `${existing.guestName} · ${eventTypeLabel(existing.eventType)} · ${existing.partySize} guests`,
      href: '/sessions?tab=events',
      dedupeKey: `event_cancel_public:${existing.id}`,
    });

    return {
      ok: true,
      message: 'Your request was canceled.',
      status: row.status,
    };
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException('No venue context.');
  }

  private async shopFloorCount(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { floorCount: true },
    });
    return Math.min(Math.max(shop?.floorCount ?? 1, 1), 10);
  }

  private resolveFloor(floor: number | undefined, maxFloors: number) {
    if (floor == null) return 1;
    return Math.min(Math.max(floor, 1), maxFloors);
  }

  private serialize(row: {
    id: string;
    shopId: string;
    eventType: EventRequestType;
    source: EventRequestSource;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
    partySize: number;
    preferredStartsAt: Date;
    preferredEndsAt: Date | null;
    zone: string | null;
    floor: number | null;
    message: string | null;
    status: EventRequestStatus;
    staffResponseNote: string | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
    seatingTableGroupId: string | null;
    resourceCategoryId: string | null;
    guestToken?: string | null;
    guestTokenHash?: string | null;
    guestTokenExpiresAt?: Date | null;
    guestTokenRevokedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    resourceCategory?: { id: string; name: string; type: string } | null;
  }) {
    return {
      id: row.id,
      shopId: row.shopId,
      eventType: row.eventType,
      source: row.source,
      guestName: row.guestName,
      guestEmail: row.guestEmail,
      guestPhone: row.guestPhone,
      partySize: row.partySize,
      preferredStartsAt: row.preferredStartsAt.toISOString(),
      preferredEndsAt: row.preferredEndsAt?.toISOString() ?? null,
      zone: row.zone,
      floor: row.floor,
      message: row.message,
      status: row.status,
      staffResponseNote: row.staffResponseNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedById: row.reviewedById,
      seatingTableGroupId: row.seatingTableGroupId,
      resourceCategoryId: row.resourceCategoryId,
      resourceCategory: row.resourceCategory ?? null,
      hasGuestLink: !!(row.guestTokenHash || row.guestToken),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(actor: JwtAccessPayload, query: EventRequestQueryDto) {
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'reservation');
    const rows = await this.prisma.eventRequest.findMany({
      where: {
        shopId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const pendingCount = await this.prisma.eventRequest.count({
      where: { shopId, status: EventRequestStatus.PENDING },
    });
    return {
      requests: rows.map((r) => this.serialize(r)),
      pendingCount,
    };
  }

  async createFromPublic(slug: string, dto: CreatePublicEventRequestDto) {
    // shopId always from published slug — never from client body.
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await assertShopHasFeature(this.prisma, shop.id, 'reservation');

    assertPrivacyConsentAccepted(dto.privacyConsentAccepted);

    if (!dto.guestName?.trim()) {
      throw new BadRequestException('Guest name is required.');
    }
    if (!dto.guestEmail?.trim() && !dto.guestPhone?.trim()) {
      throw new BadRequestException(
        'Provide an email or phone number so the venue can reach you.',
      );
    }

    const party = dto.partySize ?? 1;
    if (!Number.isInteger(party) || party < 1 || party > 100) {
      throw new BadRequestException('Party size must be between 1 and 100.');
    }

    const { preferredStartsAt, preferredEndsAt } = parseDateRange(
      dto.preferredStartsAt,
      dto.preferredEndsAt,
    );

    await assertWithinOpeningHours(
      this.prisma,
      shop.id,
      preferredStartsAt,
      preferredEndsAt ?? preferredStartsAt,
    );

    const issued = issueGuestToken({
      from: preferredEndsAt ?? preferredStartsAt,
    });

    if (dto.resourceCategoryId) {
      const cat = await this.prisma.resourceCategory.findFirst({
        where: { id: dto.resourceCategoryId, shopId: shop.id },
        select: { id: true, type: true },
      });
      if (!cat) {
        throw new BadRequestException('Selected area or activity is not available.');
      }
      if (dto.eventType === EventRequestType.TABLE && cat.type !== 'DINING') {
        throw new BadRequestException('Select a dining area for table requests.');
      }
      if (
        dto.eventType === EventRequestType.GAMING &&
        cat.type === 'DINING'
      ) {
        throw new BadRequestException('Select a gaming activity for this request.');
      }
    }

    const row = await this.prisma.eventRequest.create({
      data: {
        shopId: shop.id,
        eventType: dto.eventType,
        source: EventRequestSource.CLIENT_WEB,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        partySize: party,
        preferredStartsAt,
        preferredEndsAt,
        zone: dto.zone ?? null,
        message: dto.message?.trim() || null,
        resourceCategoryId: dto.resourceCategoryId ?? null,
        ...guestTokenPersistFields(issued),
      },
    });

    const label = eventTypeLabel(row.eventType);
    const window = this.formatWindow(preferredStartsAt, preferredEndsAt);

    await this.audit.recordForShop(shop.id, {
      section: 'reservation',
      action: 'event_request.create_public',
      summary: `${row.guestName} submitted ${label} request (${window})`,
      meta: {
        requestId: row.id,
        eventType: row.eventType,
        guestName: row.guestName,
        partySize: row.partySize,
        preferredStartsAt: preferredStartsAt.toISOString(),
        preferredEndsAt: preferredEndsAt?.toISOString() ?? null,
        source: row.source,
      },
    });

    await recordConsent(this.prisma, {
      shopId: shop.id,
      purpose: 'EVENT_REQUEST',
      guestEmail: row.guestEmail,
      sourceEntityType: 'eventRequest',
      sourceEntityId: row.id,
    });

    const title =
      row.eventType === EventRequestType.TABLE
        ? 'New table request'
        : row.eventType === EventRequestType.GAMING
          ? 'New gaming booking request'
          : 'New event request';
    await this.notifications.recordReservationEvent(shop.id, {
      title,
      body: `${row.guestName} · ${label} · ${row.partySize} guests · ${window}`,
      href: '/sessions?tab=events',
      dedupeKey: `event-request:${row.id}`,
    });

    return {
      ok: true,
      message:
        'Your request was sent. The venue will review it and get back to you.',
      id: row.id,
      guestToken: issued.raw,
      // Slug from DB row, not raw request param (same lookup, defense in depth).
      statusPath: guestVenueStatusPath(shop.slug, issued.raw, 'event'),
    };
  }

  async createStaff(actor: JwtAccessPayload, dto: CreateStaffEventRequestDto) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'reservation');
    const maxFloors = await this.shopFloorCount(shopId);

    const { preferredStartsAt, preferredEndsAt } = parseDateRange(
      dto.preferredStartsAt,
      dto.preferredEndsAt,
    );

    const issued = issueGuestToken({
      from: preferredEndsAt ?? preferredStartsAt,
    });

    const row = await this.prisma.eventRequest.create({
      data: {
        shopId,
        eventType: dto.eventType,
        source: dto.source ?? EventRequestSource.PHONE,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        partySize: dto.partySize,
        preferredStartsAt,
        preferredEndsAt,
        zone: dto.zone ?? null,
        floor:
          dto.floor != null ? this.resolveFloor(dto.floor, maxFloors) : null,
        message: dto.message?.trim() || null,
        ...guestTokenPersistFields(issued),
      },
    });

    await this.audit.record(actor, {
      section: 'reservation',
      action: 'event_request.create',
      summary: `Logged event request for ${row.guestName}`,
      meta: { requestId: row.id, source: row.source },
    });

    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { slug: true },
    });
    // Raw token once — DB stores hash only; list/get cannot re-derive it.
    return {
      ...this.serialize(row),
      guestToken: issued.raw,
      statusPath: shop?.slug
        ? guestVenueStatusPath(shop.slug, issued.raw, 'event')
        : null,
    };
  }

  async review(
    actor: JwtAccessPayload,
    id: string,
    dto: ReviewEventRequestDto,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'reservation');

    const existing = await this.prisma.eventRequest.findFirst({
      where: { id, shopId },
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
    });
    if (!existing) throw new NotFoundException('Event request not found.');
    if (existing.status !== EventRequestStatus.PENDING) {
      throw new BadRequestException('This request was already reviewed.');
    }

    if (dto.action === 'decline') {
      const note = dto.staffResponseNote?.trim();
      if (!note) {
        throw new BadRequestException(
          'Add a note explaining why the request was declined.',
        );
      }

      const row = await this.prisma.eventRequest.update({
        where: { id, shopId },
        data: {
          status: EventRequestStatus.DECLINED,
          staffResponseNote: note,
          reviewedAt: new Date(),
          reviewedById: actor.sub,
        },
        include: {
          resourceCategory: { select: { id: true, name: true, type: true } },
        },
      });

      await this.audit.record(actor, {
        section: 'reservation',
        action: 'event_request.decline',
        summary: `Declined event request for ${existing.guestName}`,
        meta: { requestId: id },
      });

      await this.notifications.recordReservationEvent(shopId, {
        title: 'Event request declined',
        body: `${existing.guestName} · ${eventTypeLabel(existing.eventType)}`,
        href: '/sessions?tab=events',
        dedupeKey: `event_decline:${id}`,
      });

      return this.serialize(row);
    }

    const createFloorBlock =
      dto.createFloorBlock !== false && !existing.resourceCategoryId;
    let seatingTableGroupId = existing.seatingTableGroupId;

    if (createFloorBlock && !seatingTableGroupId) {
      const maxFloors = await this.shopFloorCount(shopId);
      const maxSort = await this.prisma.seatingTableGroup.aggregate({
        where: { shopId },
        _max: { sortOrder: true },
      });
      const label =
        dto.floorBlockLabel?.trim() ||
        `${eventTypeLabel(existing.eventType)} — ${existing.guestName}`;
      const block = await this.prisma.seatingTableGroup.create({
        data: {
          shopId,
          zone: existing.zone ?? 'INDOOR',
          floor: this.resolveFloor(
            dto.floor ?? existing.floor ?? undefined,
            maxFloors,
          ),
          label,
          capacity: Math.max(existing.partySize, 1),
          totalCount: 1,
          availableCount: 0,
          note:
            [
              existing.message,
              existing.guestPhone ? `Phone: ${existing.guestPhone}` : null,
              existing.guestEmail ? `Email: ${existing.guestEmail}` : null,
            ]
              .filter(Boolean)
              .join('\n')
              .slice(0, 500) || null,
          isCustom: true,
          eventStartsAt: existing.preferredStartsAt,
          eventEndsAt: existing.preferredEndsAt,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
      seatingTableGroupId = block.id;
    }

    const row = await this.prisma.eventRequest.update({
      where: { id, shopId },
      data: {
        status: EventRequestStatus.APPROVED,
        staffResponseNote: dto.staffResponseNote?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: actor.sub,
        seatingTableGroupId,
      },
      include: {
        resourceCategory: { select: { id: true, name: true, type: true } },
      },
    });

    await this.audit.record(actor, {
      section: 'reservation',
      action: 'event_request.approve',
      summary: `Approved event request for ${existing.guestName}`,
      meta: {
        requestId: id,
        seatingTableGroupId,
        resourceCategoryId: existing.resourceCategoryId,
      },
    });

    const diningHint =
      existing.resourceCategory?.type === 'DINING'
        ? ' · reserve tables on the dining floor map'
        : existing.resourceCategory
          ? ` · ${existing.resourceCategory.name}`
          : '';

    await this.notifications.recordReservationEvent(shopId, {
      title: 'Event request approved',
      body: `${existing.guestName} · ${eventTypeLabel(existing.eventType)}${diningHint}`,
      href: existing.resourceCategory?.type === 'DINING'
        ? '/sessions?tab=dining'
        : '/sessions?tab=events',
      dedupeKey: `event_approve:${id}`,
    });

    return this.serialize(row);
  }

  async cancel(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);

    const existing = await this.prisma.eventRequest.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException('Event request not found.');

    const row = await this.prisma.eventRequest.update({
      where: { id, shopId },
      data: {
        status: EventRequestStatus.CANCELED,
        ...guestTokenRevokeFields(),
      },
    });

    await this.audit.record(actor, {
      section: 'reservation',
      action: 'event_request.cancel',
      summary: `Canceled event request for ${existing.guestName}`,
      meta: { requestId: id },
    });

    await this.notifications.recordReservationEvent(shopId, {
      title: 'Event request canceled',
      body: `${existing.guestName} · ${eventTypeLabel(existing.eventType)}`,
      href: '/sessions?tab=events',
      dedupeKey: `event_cancel:${id}`,
    });

    return this.serialize(row);
  }
}
