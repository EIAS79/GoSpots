import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReservationStatus, ResourceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireShopId } from '../../common/tenant';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ACTIVE_RESERVATION,
  computeUnitFloorStatus,
} from '../../common/booking-floor-status';
import { assertBookingSlotFree } from '../../common/booking-overlap.util';
import { withResourceBookingLock } from '../../common/booking-lock.util';
import {
  assertPrivacyConsentAccepted,
  recordConsent,
} from '../../common/gdpr-consent.util';
import { assertWithinOpeningHours } from '../../common/opening-hours.util';
import { loadShopVenueTimeContext } from '../../common/shop-venue-time.util';
import {
  calendarDayInTimeZone,
  dayBoundsInTimeZone,
  parseDateKey,
} from '../../common/venue-timezone.util';
import {
  walkInEffectiveEnd,
  walkInToScheduleBooking,
} from '../../common/walk-in-block.util';
import {
  getBookingUnitKind,
  getBookingUnitLabels,
  featuredTypeSortIndex,
} from '../../common/booking-unit-kind';
import {
  CreateReservationDto,
  ReservationQueryDto,
  ScheduleQueryDto,
  UpdateReservationDto,
} from './dto/reservations.dto';
import { CreatePublicGamingReservationDto } from '../guest/dto/public-gaming.dto';
import { MailService } from '../mail/mail.service';
import {
  buildGamingReservationEmail,
  buildReservationEmail,
  gamingReservationSubject,
  reservationEmailSubject,
  type GamingReservationMailDetails,
} from '../mail/gaming-reservation-mail';
import {
  holdEndsAt,
  isDiningResourceType,
  parseNoShowMinutes,
  sessionEndsAt,
  usesSessionLifecycle,
} from '../../common/dining-reservation.util';
import { FEATURED_GAME_TYPES } from '../../common/booking-unit-kind';
import { resolveGuestGamingPhase } from '../../common/guest-gaming-booking-status';
import {
  absoluteAppUrl,
  guestVenueStatusPath,
  reservationSessionsHref,
  type ReservationNotificationTab,
} from '../../common/reservation-notification-href';
import { canGuestCancelReservation } from '../../common/guest-reservation-cancel.util';
import {
  assertGuestTokenActive,
  guestTokenLookupWhere,
  guestTokenNeedsRevoke,
  guestTokenPersistFields,
  guestTokenRevokeFields,
  issueGuestToken,
  verifyPresentedGuestToken,
} from '../../common/guest-token.util';
import { serializeMoneyOrNull, toMoneyNumber } from '../../common/money.util';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postReservationBilled } from '../../common/ledger-post.util';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private formatWindow(startsAt: Date, endsAt: Date) {
    const date = startsAt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const start = startsAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const end = endsAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${date} · ${start}–${end}`;
  }

  private async logBooking(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    await this.audit.record(actor, {
      section: 'reservation',
      action,
      summary,
      meta,
    });
  }

  private async maybeNotifyStaff(
    shopId: string,
    staffAlert: boolean,
    title: string,
    body: string,
    startsAt: Date,
    tab: ReservationNotificationTab = 'schedule',
  ) {
    if (!staffAlert) return;
    await this.notifications.recordReservationEvent(shopId, {
      title,
      body,
      href: reservationSessionsHref(startsAt, tab),
    });
  }

  private reservationTabForType(type: string | null | undefined) {
    return type && isDiningResourceType(type) ? 'dining' : 'schedule';
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? '';
    if (p !== '*' && !p.split(',').includes('reservation.write')) {
      throw new ForbiddenException('Missing reservation.write');
    }
  }

  async list(actor: JwtAccessPayload, query: ReservationQueryDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'reservation');
    const where: {
      shopId: string;
      resourceId?: string;
      resource?: { categoryId: string };
      startsAt?: { gte?: Date; lte?: Date };
    } = { shopId };

    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.categoryId) {
      where.resource = { categoryId: query.categoryId };
    }
    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) where.startsAt.gte = new Date(query.from);
      if (query.to) where.startsAt.lte = new Date(query.to);
    }

    const rows = await this.prisma.reservation.findMany({
      where,
      include: {
        resource: {
          include: { category: true },
        },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    return { reservations: rows };
  }

  async getSchedule(actor: JwtAccessPayload, query: ScheduleQueryDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'reservation');
    return this.buildScheduleForShop(shopId, query);
  }

  /**
   * Public availability snapshot for one venue day.
   *
   * TOCTOU (accepted): a free slot here is not a reservation. Concurrent guests
   * (or staff) can take the unit between this read and POST create. Create must
   * re-check under `withResourceBookingLock` + `assertBookingSlotFree` and may
   * 409; clients should refresh schedule on conflict.
   */
  async getPublicSchedule(
    slug: string,
    query: ScheduleQueryDto,
    kind?: 'dining' | 'gaming',
  ) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    return this.buildScheduleForShop(shop.id, query, {
      sanitizeGuests: true,
      kind,
    });
  }

  private isGamingResourceType(type: string | null | undefined) {
    return !!type && (FEATURED_GAME_TYPES as string[]).includes(type);
  }

  /** Schedule look-ahead / look-back vs venue "today" (calendar days). */
  private static readonly SCHEDULE_PAST_DAYS = 1;
  private static readonly SCHEDULE_FUTURE_DAYS = 366;
  /** Allow a short skew so "now" booking UIs aren't flaky. */
  private static readonly BOOKING_PAST_GRACE_MS = 5 * 60 * 1000;

  private assertScheduleDateWithinHorizon(
    dateKey: string,
    timeZone: string,
    at: Date = new Date(),
  ) {
    const todayKey = calendarDayInTimeZone(timeZone, at);
    const today = parseDateKey(todayKey);
    const target = parseDateKey(dateKey);
    const todayUtc = Date.UTC(today.y, today.m - 1, today.d);
    const targetUtc = Date.UTC(target.y, target.m - 1, target.d);
    const deltaDays = Math.round((targetUtc - todayUtc) / 86_400_000);
    if (deltaDays < -ReservationsService.SCHEDULE_PAST_DAYS) {
      throw new BadRequestException(
        'Schedule date is too far in the past.',
      );
    }
    if (deltaDays > ReservationsService.SCHEDULE_FUTURE_DAYS) {
      throw new BadRequestException(
        'Schedule date is too far in the future.',
      );
    }
  }

  private assertBookingStartWithinHorizon(
    startsAt: Date,
    timeZone: string,
    at: Date = new Date(),
  ) {
    if (startsAt.getTime() < at.getTime() - ReservationsService.BOOKING_PAST_GRACE_MS) {
      throw new BadRequestException('Start time cannot be in the past.');
    }
    const startKey = calendarDayInTimeZone(timeZone, startsAt);
    this.assertScheduleDateWithinHorizon(startKey, timeZone, at);
  }

  private guestStatusPath(
    venueSlug: string,
    token: string,
    resourceType: string | null | undefined,
  ) {
    return guestVenueStatusPath(
      venueSlug,
      token,
      isDiningResourceType(resourceType) ? 'dining' : 'gaming',
    );
  }

  /**
   * Public booking create. Availability GET is advisory only (see getPublicSchedule
   * TOCTOU). Overlap + bookability are enforced here under a resource row lock.
   */
  async createPublicGamingBooking(
    slug: string,
    dto: CreatePublicGamingReservationDto,
    kind?: 'dining' | 'gaming',
  ) {
    // shopId always from published slug — never from client body.
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await assertShopFeature(this.prisma, shop.id, 'reservation');

    assertPrivacyConsentAccepted(dto.privacyConsentAccepted);

    if (!dto.guestName?.trim()) {
      throw new BadRequestException('Guest name is required.');
    }
    if (!dto.guestEmail?.trim()) {
      throw new BadRequestException(
        'An email address is required so we can send your booking confirmation.',
      );
    }

    const party = dto.partySize ?? 1;
    if (!Number.isInteger(party) || party < 1 || party > 100) {
      throw new BadRequestException('Party size must be between 1 and 100.');
    }

    const startsAt = new Date(dto.startsAt);
    let endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid start or end date/time.');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('End time must be after start time.');
    }

    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shop.id,
    );
    this.assertBookingStartWithinHorizon(startsAt, resolvedTimeZone);

    const resource = await this.prisma.resource.findFirst({
      where: { id: dto.resourceId, shopId: shop.id },
      include: { category: true },
    });
    if (!resource) {
      throw new BadRequestException('Table or unit not found.');
    }

    if (kind === 'dining' && !isDiningResourceType(resource.type)) {
      throw new BadRequestException('This table is not available for dining booking.');
    }
    if (kind === 'gaming' && !this.isGamingResourceType(resource.type)) {
      throw new BadRequestException('This unit is not available for gaming booking.');
    }

    if (resource.capacity != null && party > resource.capacity) {
      throw new BadRequestException(
        isDiningResourceType(resource.type)
          ? `This table seats up to ${resource.capacity} guests.`
          : `This unit holds up to ${resource.capacity} guests.`,
      );
    }

    if (usesSessionLifecycle(resource.type)) {
      const noShowMinutes = parseNoShowMinutes(resource.category?.offeringConfig);
      endsAt = holdEndsAt(startsAt, noShowMinutes);
    } else {
      const maxSpanMs = 24 * 60 * 60 * 1000;
      if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
        throw new BadRequestException(
          'A single booking cannot span more than 24 hours.',
        );
      }
    }

    await assertWithinOpeningHours(
      this.prisma,
      shop.id,
      startsAt,
      usesSessionLifecycle(resource.type) ? startsAt : endsAt,
    );

    const issued = issueGuestToken({
      from: endsAt,
    });

    const row = await withResourceBookingLock(
      this.prisma,
      dto.resourceId,
      async (tx) => {
        await assertBookingSlotFree(
          tx,
          shop.id,
          dto.resourceId,
          startsAt,
          endsAt,
        );
        return tx.reservation.create({
          data: {
            shopId: shop.id,
            resourceId: dto.resourceId,
            guestName: dto.guestName.trim(),
            guestEmail: dto.guestEmail?.trim() || null,
            guestPhone: dto.guestPhone?.trim() || null,
            partySize: party,
            startsAt,
            endsAt,
            status: ReservationStatus.CONFIRMED,
            staffAlert: true,
            notes: dto.notes?.trim() || null,
            ...guestTokenPersistFields(issued),
          },
          include: { resource: { include: { category: true } } },
        });
      },
    );

    const isDining = isDiningResourceType(resource.type);
    const unitLabel = row.resource?.name ?? 'station';
    const categoryName = row.resource?.category?.name ?? 'Gaming';
    const window = this.formatWindow(row.startsAt, row.endsAt);
    const contactBits = [
      row.guestEmail,
      row.guestPhone ? `tel ${row.guestPhone}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    await this.audit.recordForShop(shop.id, {
      section: 'reservation',
      action: 'reservation.create_public',
      summary: `Guest ${row.guestName} booked ${unitLabel} (${window})`,
      meta: {
        reservationId: row.id,
        resourceId: row.resourceId,
        guestName: row.guestName,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status,
        source: isDining ? 'public_dining' : 'public_gaming',
      },
    });

    await recordConsent(this.prisma, {
      shopId: shop.id,
      purpose: 'BOOKING',
      guestEmail: row.guestEmail,
      sourceEntityType: 'reservation',
      sourceEntityId: row.id,
    });

    await this.notifications.recordReservationEvent(shop.id, {
      title: isDining
        ? 'New online table reservation'
        : 'New online gaming booking',
      body: `${row.guestName} · ${categoryName} · ${unitLabel} · ${window}${contactBits ? ` · ${contactBits}` : ''}`,
      href: reservationSessionsHref(
        row.startsAt,
        isDining ? 'dining' : 'schedule',
      ),
      dedupeKey: `public-reservation:${row.id}`,
    });

    const statusPath = this.guestStatusPath(
      shop.slug,
      issued.raw,
      resource.type,
    );
    let emailSent = false;
    try {
      const mailResult = await this.sendGuestReservationMail(
        {
          guestName: row.guestName,
          guestEmail: row.guestEmail!,
          venueName: shop.name,
          venueSlug: shop.slug,
          categoryName,
          unitName: unitLabel,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          status: row.status,
          notes: row.notes,
          statusPath,
          isDining,
        },
        'confirmed',
      );
      emailSent = mailResult.sent;
    } catch (err) {
      // Booking must succeed even if email provider fails.
      console.error('Guest gaming confirmation email failed', err);
    }

    return {
      ok: true,
      message: emailSent
        ? 'Your booking is confirmed. Check your email for details and use the link below to track your session.'
        : 'Your booking is confirmed. Use the link below to track your session.',
      id: row.id,
      guestToken: issued.raw,
      statusPath,
      emailSent,
    };
  }

  async getPublicGamingStatus(
    slug: string,
    token: string,
    kind?: 'dining' | 'gaming',
  ) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    const row = await this.prisma.reservation.findFirst({
      where: guestTokenLookupWhere(shop.id, token),
      include: {
        resource: { include: { category: true } },
      },
    });
    if (!row || !verifyPresentedGuestToken(row, token)) {
      throw new NotFoundException('Booking not found.');
    }
    assertGuestTokenActive(row);

    const now = new Date();
    const isDining = isDiningResourceType(row.resource?.type);
    if (kind === 'dining' && !isDining) {
      throw new NotFoundException('Booking not found.');
    }
    if (kind === 'gaming' && isDining) {
      throw new NotFoundException('Booking not found.');
    }

    const canCancel = canGuestCancelReservation(
      row.status,
      row.startsAt,
      row.resource?.type,
      now,
    );

    const phase = resolveGuestGamingPhase(
      row.status,
      row.startsAt,
      row.endsAt,
    );

    return {
      status: row.status,
      phase,
      guestName: row.guestName,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      partySize: row.partySize,
      notes: row.notes,
      unitName: row.resource?.name ?? null,
      categoryName: row.resource?.category?.name ?? null,
      categoryType: row.resource?.category?.type ?? null,
      venueName: shop.name,
      venueSlug: shop.slug,
      canCancel,
      isDining,
      billedAt: row.billedAt?.toISOString() ?? null,
      billedAmount: serializeMoneyOrNull(row.billedAmount),
      awaitingPayment:
        row.status === ReservationStatus.COMPLETED && row.billedAt == null,
    };
  }

  async cancelPublicGamingBooking(
    slug: string,
    token: string,
    kind?: 'dining' | 'gaming',
  ) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    const row = await this.prisma.reservation.findFirst({
      where: guestTokenLookupWhere(shop.id, token),
      include: { resource: { include: { category: true } } },
    });
    if (!row || !verifyPresentedGuestToken(row, token)) {
      throw new NotFoundException('Booking not found.');
    }
    assertGuestTokenActive(row);

    const isDining = isDiningResourceType(row.resource?.type);
    if (kind === 'dining' && !isDining) {
      throw new NotFoundException('Booking not found.');
    }
    if (kind === 'gaming' && isDining) {
      throw new NotFoundException('Booking not found.');
    }

    if (row.status === ReservationStatus.CANCELED) {
      // Legacy / race: canceled without revoke — seal the link, then ok once.
      // Already-revoked tokens never reach here (assertGuestTokenActive).
      if (guestTokenNeedsRevoke(row)) {
        await this.prisma.reservation.update({
          where: { id: row.id, shopId: shop.id },
          data: guestTokenRevokeFields(),
        });
      }
      return { ok: true, message: 'This booking was already canceled.' };
    }
    if (row.status === ReservationStatus.COMPLETED) {
      throw new BadRequestException('This session has already ended.');
    }
    if (row.status === ReservationStatus.CHECKED_IN) {
      throw new BadRequestException(
        'This reservation is already in progress — contact the venue if you need to change plans.',
      );
    }

    if (
      !canGuestCancelReservation(
        row.status,
        row.startsAt,
        row.resource?.type,
        new Date(),
      )
    ) {
      throw new BadRequestException(
        isDining
          ? 'This reservation can no longer be canceled online.'
          : 'Bookings can only be canceled before the start time.',
      );
    }

    const canceledAt = new Date();
    const updated = await this.prisma.reservation.update({
      where: { id: row.id, shopId: shop.id },
      data: {
        status: ReservationStatus.CANCELED,
        endsAt: canceledAt,
        ...guestTokenRevokeFields(canceledAt),
      },
      include: { resource: { include: { category: true } } },
    });

    if (updated.resourceId) {
      await this.prisma.resource.update({
        where: { id: updated.resourceId, shopId: shop.id },
        data: { status: ResourceStatus.AVAILABLE },
      });
    }

    const unitLabel = updated.resource?.name ?? 'station';
    const categoryName = updated.resource?.category?.name ?? 'Gaming';
    const window = this.formatWindow(updated.startsAt, updated.endsAt);
    const statusPath = this.guestStatusPath(
      shop.slug,
      token,
      updated.resource?.type,
    );

    await this.audit.recordForShop(shop.id, {
      section: 'reservation',
      action: 'reservation.cancel_public',
      summary: `Guest ${updated.guestName} canceled ${unitLabel} (${window})`,
      meta: {
        reservationId: updated.id,
        resourceId: updated.resourceId,
        guestName: updated.guestName,
        startsAt: updated.startsAt.toISOString(),
        endsAt: updated.endsAt.toISOString(),
        status: updated.status,
        source: isDining ? 'public_dining' : 'public_gaming',
      },
    });

    await this.notifications.recordReservationEvent(shop.id, {
      title: isDining
        ? 'Guest canceled table reservation'
        : 'Guest canceled gaming booking',
      body: `${updated.guestName} · ${categoryName} · ${unitLabel} · ${window}`,
      href: reservationSessionsHref(
        updated.startsAt,
        isDining ? 'dining' : 'schedule',
      ),
      dedupeKey: `public-cancel:${updated.id}`,
    });

    if (updated.guestEmail?.trim()) {
      void this.sendGuestReservationMail(
        {
          guestName: updated.guestName,
          guestEmail: updated.guestEmail,
          venueName: shop.name,
          venueSlug: shop.slug,
          categoryName,
          unitName: unitLabel,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
          status: updated.status,
          notes: updated.notes,
          statusPath,
          isDining,
        },
        'canceled',
      ).catch(() => undefined);
    }

    return {
      ok: true,
      message: isDining
        ? 'Your table reservation has been canceled.'
        : 'Your booking has been canceled.',
      status: updated.status,
    };
  }

  private async buildScheduleForShop(
    shopId: string,
    query: ScheduleQueryDto,
    options?: { sanitizeGuests?: boolean; kind?: 'dining' | 'gaming' },
  ) {
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );

    let dayStart: Date;
    let dayEnd: Date;
    try {
      parseDateKey(query.date);
      this.assertScheduleDateWithinHorizon(query.date, resolvedTimeZone);
      ({ dayStart, dayEnd } = dayBoundsInTimeZone(
        query.date,
        resolvedTimeZone,
      ));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Invalid date');
    }

    if (query.categoryId) {
      const category = await this.prisma.resourceCategory.findFirst({
        where: { id: query.categoryId, shopId },
        select: { id: true, type: true },
      });
      if (!category) {
        throw new BadRequestException('Category not found for this venue.');
      }
      if (
        options?.kind === 'dining' &&
        !isDiningResourceType(category.type)
      ) {
        throw new BadRequestException(
          'Category is not available for dining schedule.',
        );
      }
      if (
        options?.kind === 'gaming' &&
        !this.isGamingResourceType(category.type)
      ) {
        throw new BadRequestException(
          'Category is not available for gaming schedule.',
        );
      }
    }

    let categories = await this.prisma.resourceCategory.findMany({
      where: {
        shopId,
        ...(query.categoryId ? { id: query.categoryId } : {}),
      },
      include: {
        resources: {
          include: { section: true, tableGroup: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        gamingSections: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    if (options?.kind === 'dining') {
      categories = categories.filter((c) => isDiningResourceType(c.type));
    } else if (options?.kind === 'gaming') {
      categories = categories.filter((c) => this.isGamingResourceType(c.type));
    }

    const resourceIds = categories.flatMap((c) => c.resources.map((r) => r.id));

    const reservations = resourceIds.length
      ? await this.prisma.reservation.findMany({
          where: {
            shopId,
            resourceId: { in: resourceIds },
            status: { in: ACTIVE_RESERVATION },
            startsAt: { lte: dayEnd },
            endsAt: { gte: dayStart },
          },
          orderBy: { startsAt: 'asc' },
        })
      : [];

    const walkInSessions = resourceIds.length
      ? await this.prisma.playSession.findMany({
          where: {
            shopId,
            resourceId: { in: resourceIds },
            status: 'ACTIVE',
            archivedAt: null,
            startedAt: { lte: dayEnd },
          },
        })
      : [];

    const now = new Date();
    const byResource = new Map<string, typeof reservations>();
    for (const r of reservations) {
      if (!r.resourceId) continue;
      const list = byResource.get(r.resourceId) ?? [];
      list.push(r);
      byResource.set(r.resourceId, list);
    }

    const walkInsByResource = new Map<string, typeof walkInSessions>();
    for (const s of walkInSessions) {
      if (!s.resourceId) continue;
      const end = walkInEffectiveEnd(s);
      if (end < dayStart) continue;
      const list = walkInsByResource.get(s.resourceId) ?? [];
      list.push(s);
      walkInsByResource.set(s.resourceId, list);
    }

    const categoriesOut = categories
      .map((cat) => {
        const unitKind = getBookingUnitKind(cat.type);
        const unitLabels = getBookingUnitLabels(unitKind);
        return {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          unitKind,
          unitLabels,
          slotMinutes: cat.slotMinutes,
          bookingMode: cat.bookingMode,
          offeringConfig: cat.offeringConfig,
          sections: cat.gamingSections.map((s) => ({
            id: s.id,
            name: s.name,
            floor: s.floor,
            isVip: s.isVip,
            seatsPerRow: s.seatsPerRow,
            sortOrder: s.sortOrder,
          })),
          units: cat.resources.map((unit) => {
            const resBookings = byResource.get(unit.id) ?? [];
            const walkInBookings = (walkInsByResource.get(unit.id) ?? []).map(
              (s) => walkInToScheduleBooking(s),
            );
            const mergedBookings = [...resBookings, ...walkInBookings].sort(
              (a, b) =>
                new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
            );
            const floorStatus = computeUnitFloorStatus(
              unit.status,
              mergedBookings.map((b) => ({
                status: b.status as ReservationStatus,
                startsAt: new Date(b.startsAt),
                endsAt: new Date(b.endsAt),
              })),
              now,
              query.date,
              resolvedTimeZone,
            );
            return {
              id: unit.id,
              name: unit.name,
              status: unit.status,
              floorStatus,
              capacity: unit.capacity ?? unit.tableGroup?.capacity ?? null,
              tableGroup: unit.tableGroup
                ? {
                    id: unit.tableGroup.id,
                    name: unit.tableGroup.name,
                    capacity: unit.tableGroup.capacity,
                    seatsPerRow: unit.tableGroup.seatsPerRow,
                    sortOrder: unit.tableGroup.sortOrder,
                  }
                : null,
              section: unit.section
                ? {
                    id: unit.section.id,
                    name: unit.section.name,
                    floor: unit.section.floor,
                    isVip: unit.section.isVip,
                    seatsPerRow: unit.section.seatsPerRow,
                  }
                : null,
              bookings: mergedBookings.map((b) => {
                const isWalkIn = b.id.startsWith('walkin:');
                return {
                  id: b.id,
                  guestName: options?.sanitizeGuests
                    ? isWalkIn
                      ? 'In use'
                      : 'Reserved'
                    : b.guestName,
                  guestEmail: options?.sanitizeGuests ? null : b.guestEmail,
                  guestPhone: options?.sanitizeGuests ? null : b.guestPhone,
                  partySize: b.partySize,
                  startsAt:
                    b.startsAt instanceof Date
                      ? b.startsAt.toISOString()
                      : b.startsAt,
                  endsAt:
                    b.endsAt instanceof Date
                      ? b.endsAt.toISOString()
                      : b.endsAt,
                  status: b.status,
                  notes: options?.sanitizeGuests ? null : b.notes,
                  staffAlert: b.staffAlert,
                };
              }),
            };
          }),
        };
      })
      .sort(
        (a, b) => featuredTypeSortIndex(a.type) - featuredTypeSortIndex(b.type),
      );

    const resourceNameById = new Map<string, string>();
    const categoryNameById = new Map<string, string>();
    for (const cat of categoriesOut) {
      categoryNameById.set(cat.id, cat.name);
      for (const unit of cat.units) {
        resourceNameById.set(unit.id, unit.name);
      }
    }

    const agenda = reservations
      .map((b) => ({
        id: b.id,
        guestName: options?.sanitizeGuests ? 'Reserved' : b.guestName,
        guestEmail: options?.sanitizeGuests ? null : b.guestEmail,
        guestPhone: options?.sanitizeGuests ? null : b.guestPhone,
        partySize: b.partySize,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: b.status,
        notes: options?.sanitizeGuests ? null : b.notes,
        staffAlert: b.staffAlert,
        resourceId: b.resourceId,
        unitName: b.resourceId
          ? (resourceNameById.get(b.resourceId) ?? null)
          : null,
        categoryId:
          categories.find((c) => c.resources.some((r) => r.id === b.resourceId))
            ?.id ?? null,
        categoryName:
          categories.find((c) => c.resources.some((r) => r.id === b.resourceId))
            ?.name ?? null,
        categoryType:
          categories.find((c) => c.resources.some((r) => r.id === b.resourceId))
            ?.type ?? null,
        awaitingPayment:
          b.resourceId != null &&
          b.billedAt == null &&
          b.status !== ReservationStatus.CANCELED &&
          b.status !== ReservationStatus.NO_SHOW &&
          b.status === ReservationStatus.COMPLETED,
      }))
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );

    const freeCount = categoriesOut.reduce(
      (sum, c) =>
        sum + c.units.filter((u) => u.floorStatus === 'AVAILABLE').length,
      0,
    );
    const totalUnits = categoriesOut.reduce(
      (sum, c) => sum + c.units.length,
      0,
    );

    return {
      date: query.date,
      categoryId: query.categoryId ?? null,
      summary: { totalUnits, freeCount, bookedCount: totalUnits - freeCount },
      categories: categoriesOut,
      agenda,
    };
  }

  async create(actor: JwtAccessPayload, dto: CreateReservationDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const party = dto.partySize ?? 1;
    if (!Number.isInteger(party) || party < 1 || party > 100) {
      throw new BadRequestException('Party size must be between 1 and 100.');
    }
    await assertShopFeature(this.prisma, shopId, 'reservation');
    const startsAt = new Date(dto.startsAt);
    let endsAt = new Date(dto.endsAt);
    let resourceType: string | null = null;
    let offeringConfig: unknown = null;

    if (dto.resourceId) {
      const resource = await this.prisma.resource.findFirst({
        where: { id: dto.resourceId, shopId },
        include: { category: true },
      });
      if (!resource) {
        throw new BadRequestException('Table or unit not found.');
      }
      resourceType = resource.type;
      offeringConfig = resource.category?.offeringConfig ?? null;
      if (usesSessionLifecycle(resource.type)) {
        const noShowMinutes = parseNoShowMinutes(offeringConfig);
        endsAt = holdEndsAt(startsAt, noShowMinutes);
      }
    }

    if (!usesSessionLifecycle(resourceType)) {
      if (endsAt <= startsAt) {
        throw new BadRequestException(
          'End time must be after start time (same day).',
        );
      }
      const maxSpanMs = 24 * 60 * 60 * 1000;
      if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
        throw new BadRequestException(
          'A single booking cannot span more than 24 hours.',
        );
      }
    }

    await assertWithinOpeningHours(
      this.prisma,
      shopId,
      startsAt,
      usesSessionLifecycle(resourceType) ? startsAt : endsAt,
    );
    const guestEmail = dto.guestEmail?.trim() || null;
    const issuedGuest = guestEmail
      ? issueGuestToken({ from: endsAt })
      : null;
    const guestTokenData = issuedGuest
      ? guestTokenPersistFields(issuedGuest)
      : {};

    const row = dto.resourceId
      ? await withResourceBookingLock(
          this.prisma,
          dto.resourceId,
          async (tx) => {
            await assertBookingSlotFree(
              tx,
              shopId,
              dto.resourceId!,
              startsAt,
              endsAt,
            );
            return tx.reservation.create({
              data: {
                shopId,
                resourceId: dto.resourceId,
                guestName: dto.guestName,
                guestEmail,
                guestPhone: dto.guestPhone,
                partySize: party,
                startsAt,
                endsAt,
                status: dto.status ?? ReservationStatus.CONFIRMED,
                staffAlert: dto.staffAlert ?? false,
                notes: dto.notes,
                ...guestTokenData,
              },
              include: { resource: { include: { category: true } } },
            });
          },
        )
      : await this.prisma.reservation.create({
          data: {
            shopId,
            resourceId: dto.resourceId,
            guestName: dto.guestName,
            guestEmail,
            guestPhone: dto.guestPhone,
            partySize: party,
            startsAt,
            endsAt,
            status: dto.status ?? ReservationStatus.CONFIRMED,
            staffAlert: dto.staffAlert ?? false,
            notes: dto.notes,
            ...guestTokenData,
          },
          include: { resource: { include: { category: true } } },
        });
    const unitLabel = row.resource?.name ?? 'unassigned unit';
    const window = this.formatWindow(row.startsAt, row.endsAt);
    await this.logBooking(
      actor,
      'reservation.create',
      `Scheduled ${row.guestName} on ${unitLabel} (${window})`,
      {
        reservationId: row.id,
        resourceId: row.resourceId,
        guestName: row.guestName,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status,
        staffAlert: row.staffAlert,
      },
    );
    const notifyTab = this.reservationTabForType(row.resource?.type);
    await this.maybeNotifyStaff(
      shopId,
      row.staffAlert,
      notifyTab === 'dining' ? 'New table booking' : 'New game booking',
      `${row.guestName} · ${unitLabel} · ${window}`,
      row.startsAt,
      notifyTab,
    );

    // Raw token once (hash-only in DB). Staff/clients that previously read
    // plaintext from the row still get it on create only.
    if (!issuedGuest) return row;
    return { ...row, guestToken: issuedGuest.raw };
  }

  async update(actor: JwtAccessPayload, id: string, dto: UpdateReservationDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    if (dto.partySize != null) {
      const party = dto.partySize;
      if (!Number.isInteger(party) || party < 1 || party > 100) {
        throw new BadRequestException('Party size must be between 1 and 100.');
      }
    }
    await assertShopFeature(this.prisma, shopId, 'reservation');
    const existing = await this.ensureReservation(shopId, id);
    const existingResource = existing.resourceId
      ? await this.prisma.resource.findFirst({
          where: { id: existing.resourceId, shopId },
          include: { category: true },
        })
      : null;
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    let endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    const resourceId =
      dto.resourceId !== undefined ? dto.resourceId : existing.resourceId;
    const nextStatus = dto.status ?? existing.status;

    const resource =
      resourceId != null
        ? await this.prisma.resource.findFirst({
            where: { id: resourceId, shopId },
            include: { category: true },
          })
        : existingResource;

    const isSession = usesSessionLifecycle(resource?.type);

    if (isSession) {
      const noShowMinutes = parseNoShowMinutes(
        resource?.category?.offeringConfig,
      );
      if (nextStatus === ReservationStatus.CHECKED_IN) {
        endsAt = sessionEndsAt(startsAt);
      } else if (
        nextStatus === ReservationStatus.CONFIRMED ||
        nextStatus === ReservationStatus.PENDING
      ) {
        endsAt = holdEndsAt(startsAt, noShowMinutes);
      } else if (dto.startsAt != null && dto.endsAt == null) {
        endsAt = holdEndsAt(startsAt, noShowMinutes);
      }
    }

    if (
      nextStatus === ReservationStatus.CANCELED &&
      dto.endsAt == null
    ) {
      endsAt = new Date();
    }

    if (!isSession && endsAt <= startsAt) {
      throw new BadRequestException(
        'End time must be after start time (same day).',
      );
    }

    if (!isSession) {
      const maxSpanMs = 24 * 60 * 60 * 1000;
      if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
        throw new BadRequestException(
          'A single booking cannot span more than 24 hours.',
        );
      }
    }

    const terminalStatus =
      nextStatus === ReservationStatus.CANCELED ||
      nextStatus === ReservationStatus.NO_SHOW;
    if (resourceId && !terminalStatus) {
      await assertWithinOpeningHours(
        this.prisma,
        shopId,
        startsAt,
        isSession ? startsAt : endsAt,
      );
    }
    const updateData = {
      ...(dto.resourceId !== undefined && { resourceId: dto.resourceId }),
      ...(dto.guestName != null && { guestName: dto.guestName }),
      ...(dto.guestEmail !== undefined && { guestEmail: dto.guestEmail }),
      ...(dto.guestPhone !== undefined && { guestPhone: dto.guestPhone }),
      ...(dto.partySize != null && { partySize: dto.partySize }),
      ...(dto.startsAt != null && { startsAt }),
      ...(dto.endsAt != null && { endsAt }),
      ...(dto.status != null && { status: dto.status }),
      ...(dto.staffAlert !== undefined && { staffAlert: dto.staffAlert }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.billedAmount !== undefined && {
        billedAmount: dto.billedAmount,
        billedAt:
          dto.billedAmount != null && dto.billedAmount > 0
            ? new Date()
            : null,
      }),
      // Always revoke on cancel / no-show (incl. re-apply) so guest links die.
      ...(dto.status === ReservationStatus.CANCELED ||
      dto.status === ReservationStatus.NO_SHOW
        ? guestTokenRevokeFields()
        : {}),
    };
    const row = resourceId
      ? await withResourceBookingLock(this.prisma, resourceId, async (tx) => {
          await assertBookingSlotFree(
            tx,
            shopId,
            resourceId,
            startsAt,
            endsAt,
            id,
          );
          return tx.reservation.update({
            where: { id, shopId },
            data: updateData,
            include: { resource: { include: { category: true } } },
          });
        })
      : await this.prisma.reservation.update({
          where: { id, shopId },
          data: updateData,
          include: { resource: { include: { category: true } } },
        });
    if (
      dto.billedAmount !== undefined &&
      row.billedAmount != null &&
      toMoneyNumber(row.billedAmount) > 0 &&
      row.billedAt
    ) {
      const currency = await loadShopCurrency(this.prisma, shopId);
      await postReservationBilled(this.prisma, {
        shopId,
        reservationId: row.id,
        billedAmount: row.billedAmount,
        currency: row.currency ?? currency,
        billedAt: row.billedAt,
        resourceId: row.resourceId,
        createdById: actor.sub,
      });
    }
    if (dto.status === ReservationStatus.CHECKED_IN && row.resourceId) {
      await this.prisma.resource.update({
        where: { id: row.resourceId, shopId },
        data: { status: ResourceStatus.BUSY },
      });
    }
    if (
      dto.status === ReservationStatus.COMPLETED ||
      dto.status === ReservationStatus.CANCELED ||
      dto.status === ReservationStatus.NO_SHOW
    ) {
      if (row.resourceId) {
        await this.prisma.resource.update({
          where: { id: row.resourceId, shopId },
          data: { status: ResourceStatus.AVAILABLE },
        });
      }
    }
    const unitLabel = row.resource?.name ?? 'unassigned unit';
    const window = this.formatWindow(row.startsAt, row.endsAt);
    const canceled =
      dto.status === ReservationStatus.CANCELED &&
      existing.status !== ReservationStatus.CANCELED;
    const action = canceled ? 'reservation.cancel' : 'reservation.update';
    const summary = canceled
      ? `Canceled booking for ${row.guestName} (${unitLabel}, ${window})`
      : `Updated booking for ${row.guestName} (${unitLabel}, ${window})`;

    await this.logBooking(actor, action, summary, {
      reservationId: id,
      resourceId: row.resourceId,
      guestName: row.guestName,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      staffAlert: row.staffAlert,
      previousStatus: existing.status,
    });

    const shouldNotify =
      row.staffAlert &&
      (dto.staffAlert === true ||
        canceled ||
        dto.startsAt != null ||
        dto.endsAt != null ||
        dto.status != null ||
        dto.guestName != null);

    if (shouldNotify) {
      const categoryName = row.resource?.category?.name ?? 'Gaming';
      const notifyTab = this.reservationTabForType(row.resource?.type);
      const dining = notifyTab === 'dining';
      await this.maybeNotifyStaff(
        shopId,
        true,
        canceled
          ? dining
            ? 'Table reservation canceled'
            : 'Game booking canceled'
          : dining
            ? 'Table reservation updated'
            : 'Game booking updated',
        `${row.guestName} · ${categoryName} · ${unitLabel} · ${window}`,
        row.startsAt,
        notifyTab,
      );
    }

    if (dto.status != null && dto.status !== existing.status) {
      const notifyTab = this.reservationTabForType(row.resource?.type);
      const dining = notifyTab === 'dining';
      if (dto.status === ReservationStatus.CHECKED_IN) {
        await this.notifications.recordReservationEvent(shopId, {
          title: dining ? 'Guest checked in at table' : 'Guest checked in',
          body: `${row.guestName} · ${unitLabel}`,
          href: reservationSessionsHref(row.startsAt, notifyTab),
          dedupeKey: `checkin:${row.id}`,
        });
      } else if (dto.status === ReservationStatus.COMPLETED) {
        await this.notifications.recordReservationEvent(shopId, {
          title: dining ? 'Guest left table' : 'Guest left session',
          body: `${row.guestName} · ${unitLabel} · awaiting payment if not paid`,
          href: reservationSessionsHref(row.startsAt, notifyTab),
          dedupeKey: `guest_left:${row.id}`,
        });
      } else if (dto.status === ReservationStatus.NO_SHOW) {
        await this.notifications.recordReservationEvent(shopId, {
          title: dining ? 'Table no-show' : 'Booking no-show',
          body: `${row.guestName} · ${unitLabel}`,
          href: reservationSessionsHref(row.startsAt, notifyTab),
          dedupeKey: `no_show:${row.id}`,
        });
      }
    }

    if (
      (row.guestTokenHash || row.guestToken) &&
      row.guestEmail?.trim() &&
      dto.status != null &&
      dto.status !== existing.status
    ) {
      const shop = await this.prisma.shop.findUnique({
        where: { id: shopId },
        select: { name: true, slug: true },
      });
      if (shop) {
        let kind: 'confirmed' | 'canceled' | 'updated' = 'updated';
        if (dto.status === ReservationStatus.CONFIRMED) kind = 'confirmed';
        if (dto.status === ReservationStatus.CANCELED) kind = 'canceled';
        // Status URL only when legacy plaintext still present (hash-only rows
        // cannot re-derive the raw token; guest keeps the original email link).
        const statusPath = row.guestToken
          ? this.guestStatusPath(
              shop.slug,
              row.guestToken,
              row.resource?.type,
            )
          : null;
        void this.sendGuestReservationMail(
          {
            guestName: row.guestName,
            guestEmail: row.guestEmail,
            venueName: shop.name,
            venueSlug: shop.slug,
            categoryName: row.resource?.category?.name ?? 'Gaming',
            unitName: unitLabel,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            status: row.status,
            notes: row.notes,
            statusPath,
            isDining: isDiningResourceType(row.resource?.type),
          },
          kind,
        ).catch(() => undefined);
      }
    }

    return row;
  }

  async delete(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    await assertShopFeature(this.prisma, shopId, 'reservation');
    const existing = await this.prisma.reservation.findFirst({
      where: { id, shopId },
      include: { resource: { include: { category: true } } },
    });
    if (!existing) throw new NotFoundException('Reservation not found');

    const unitLabel = existing.resource?.name ?? 'unassigned unit';
    const window = this.formatWindow(existing.startsAt, existing.endsAt);

    if (
      (existing.guestTokenHash || existing.guestToken) &&
      existing.guestEmail?.trim()
    ) {
      const shop = await this.prisma.shop.findUnique({
        where: { id: shopId },
        select: { name: true, slug: true },
      });
      if (shop) {
        const statusPath = existing.guestToken
          ? this.guestStatusPath(
              shop.slug,
              existing.guestToken,
              existing.resource?.type,
            )
          : null;
        void this.sendGuestReservationMail(
          {
            guestName: existing.guestName,
            guestEmail: existing.guestEmail,
            venueName: shop.name,
            venueSlug: shop.slug,
            categoryName: existing.resource?.category?.name ?? 'Gaming',
            unitName: unitLabel,
            startsAt: existing.startsAt,
            endsAt: existing.endsAt,
            status: ReservationStatus.CANCELED,
            notes: existing.notes,
            statusPath,
            isDining: isDiningResourceType(existing.resource?.type),
          },
          'canceled',
        ).catch(() => undefined);
      }
    }

    await this.prisma.reservation.delete({ where: { id, shopId } });

    await this.logBooking(
      actor,
      'reservation.delete',
      `Removed booking for ${existing.guestName} (${unitLabel}, ${window})`,
      {
        reservationId: id,
        resourceId: existing.resourceId,
        guestName: existing.guestName,
        startsAt: existing.startsAt.toISOString(),
        endsAt: existing.endsAt.toISOString(),
        status: existing.status,
        staffAlert: existing.staffAlert,
      },
    );

    if (existing.staffAlert) {
      const notifyTab = this.reservationTabForType(existing.resource?.type);
      await this.maybeNotifyStaff(
        shopId,
        true,
        notifyTab === 'dining'
          ? 'Table reservation removed'
          : 'Game booking removed',
        `${existing.guestName} · ${unitLabel} · ${window}`,
        existing.startsAt,
        notifyTab,
      );
    }

    return { ok: true };
  }

  private webAppBaseUrl() {
    return (
      this.config.get<string>('WEB_APP_URL')?.trim() ||
      this.config.get<string>('WEB_ORIGIN')?.trim()?.split(',')[0]?.trim() ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private async sendGuestReservationMail(
    input: {
      guestName: string;
      guestEmail: string;
      venueName: string;
      venueSlug: string;
      categoryName: string;
      unitName: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
      notes?: string | null;
      statusPath?: string | null;
      isDining?: boolean;
    },
    kind: 'created' | 'confirmed' | 'canceled' | 'updated',
  ) {
    // Only same-app relative paths — never concatenate attacker absolute URLs.
    const statusUrl = absoluteAppUrl(this.webAppBaseUrl(), input.statusPath);
    const details: GamingReservationMailDetails = {
      guestName: input.guestName,
      venueName: input.venueName,
      categoryName: input.categoryName,
      unitName: input.unitName,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      statusUrl,
      notes: input.notes,
      isDining: input.isDining,
    };
    const { html, text } = buildReservationEmail(details, kind);
    return this.mail.send({
      to: input.guestEmail,
      subject: reservationEmailSubject(
        input.venueName,
        kind,
        input.isDining,
      ),
      html,
      text,
    });
  }

  private async ensureReservation(shopId: string, id: string) {
    const r = await this.prisma.reservation.findFirst({
      where: { id, shopId },
    });
    if (!r) throw new NotFoundException('Reservation not found');
    return r;
  }
}
