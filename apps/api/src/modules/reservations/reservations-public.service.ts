import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReservationStatus, ResourceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  parseDateKey,
} from '../../common/venue-timezone.util';
import { CreatePublicGamingReservationDto } from '../guest/dto/public-gaming.dto';
import { MailService } from '../mail/mail.service';
import {
  buildReservationEmail,
  reservationEmailSubject,
  type GamingReservationMailDetails,
} from '../mail/gaming-reservation-mail';
import {
  holdEndsAt,
  isDiningResourceType,
  parseNoShowMinutes,
  usesHoldArrivalWindow,
} from '../../common/dining-reservation.util';
import { FEATURED_GAME_TYPES } from '../../common/booking-unit-kind';
import {
  absoluteAppUrl,
  guestVenueStatusPath,
  reservationSessionsHref,
} from '../../common/reservation-notification-href';
import { resolveGuestGamingPhase } from '../../common/guest-gaming-booking-status';
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
import { serializeMoneyOrNull } from '../../common/money.util';

@Injectable()
export class ReservationsPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Schedule look-ahead / look-back vs venue "today" (calendar days). */
  private static readonly SCHEDULE_PAST_DAYS = 1;
  private static readonly SCHEDULE_FUTURE_DAYS = 366;
  /** Allow a short skew so "now" booking UIs aren't flaky. */
  private static readonly BOOKING_PAST_GRACE_MS = 5 * 60 * 1000;

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

  private isGamingResourceType(type: string | null | undefined) {
    return !!type && (FEATURED_GAME_TYPES as string[]).includes(type);
  }

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
    if (deltaDays < -ReservationsPublicService.SCHEDULE_PAST_DAYS) {
      throw new BadRequestException(
        'Schedule date is too far in the past.',
      );
    }
    if (deltaDays > ReservationsPublicService.SCHEDULE_FUTURE_DAYS) {
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
    if (
      startsAt.getTime() <
      at.getTime() - ReservationsPublicService.BOOKING_PAST_GRACE_MS
    ) {
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

    if (usesHoldArrivalWindow(resource.type)) {
      const noShowMinutes = parseNoShowMinutes(resource.category?.offeringConfig);
      endsAt = holdEndsAt(startsAt, noShowMinutes);
    } else {
      const maxSpanMs = 24 * 60 * 60 * 1000;
      if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
        throw new BadRequestException(
          'A single booking cannot span more than 24 hours.',
        );
      }
      const minSpanMs = 15 * 60_000;
      if (endsAt.getTime() - startsAt.getTime() < minSpanMs) {
        throw new BadRequestException(
          'Book at least 15 minutes of play time.',
        );
      }
    }

    await assertWithinOpeningHours(
      this.prisma,
      shop.id,
      startsAt,
      usesHoldArrivalWindow(resource.type) ? startsAt : endsAt,
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
}
