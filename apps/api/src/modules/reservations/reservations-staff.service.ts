import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReservationStatus, ResourceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import { requireShopId } from '../../common/tenant';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertBookingSlotFree } from '../../common/booking-overlap.util';
import { withResourceBookingLock } from '../../common/booking-lock.util';
import { assertWithinOpeningHours } from '../../common/opening-hours.util';
import {
  CreateReservationDto,
  DeleteReservationDto,
  ReservationQueryDto,
  UpdateReservationDto,
} from './dto/reservations.dto';
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
  sessionEndsAt,
  usesHoldArrivalWindow,
  usesSessionLifecycle,
} from '../../common/dining-reservation.util';
import {
  absoluteAppUrl,
  guestVenueStatusPath,
  reservationSessionsHref,
  type ReservationNotificationTab,
} from '../../common/reservation-notification-href';
import {
  guestTokenPersistFields,
  guestTokenRevokeFields,
  issueGuestToken,
} from '../../common/guest-token.util';
import { toMoneyNumber } from '../../common/money.util';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postReservationBilled } from '../../common/ledger-post.util';

/**
 * Staff reservation CRUD API surface.
 *
 * Extracted from `ReservationsService` as part of Bible §14 (reservations
 * capability split). `ReservationsService` still facade-delegates
 * `list` / `create` / `update` / `delete` so controllers and existing
 * callers are unaffected.
 */
@Injectable()
export class ReservationsStaffService {
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
      if (usesHoldArrivalWindow(resource.type)) {
        const noShowMinutes = parseNoShowMinutes(offeringConfig);
        endsAt = holdEndsAt(startsAt, noShowMinutes);
      }
    }

    if (!usesHoldArrivalWindow(resourceType)) {
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
      if (resourceType && endsAt.getTime() - startsAt.getTime() < 15 * 60_000) {
        throw new BadRequestException(
          'Book at least 15 minutes of play time.',
        );
      }
    }

    await assertWithinOpeningHours(
      this.prisma,
      shopId,
      startsAt,
      usesHoldArrivalWindow(resourceType) ? startsAt : endsAt,
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
    assertExpectedVersion(existing.version, dto.expectedVersion, {
      aggregateType: 'reservation',
      aggregateId: id,
    });
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
    const holdOnly = usesHoldArrivalWindow(resource?.type);

    if (holdOnly) {
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
    } else if (isSession) {
      // Gaming fixed play window: keep client/existing endsAt.
      // On check-in without a new end, preserve booked window (or open to EOD if missing).
      if (nextStatus === ReservationStatus.CHECKED_IN && dto.endsAt == null) {
        if (endsAt <= startsAt) {
          endsAt = sessionEndsAt(startsAt);
        }
      } else if (dto.startsAt != null && dto.endsAt == null) {
        // start moved without end — keep duration
        const prevSpan =
          existing.endsAt.getTime() - existing.startsAt.getTime();
        endsAt = new Date(startsAt.getTime() + Math.max(prevSpan, 15 * 60_000));
      }
    }

    if (
      nextStatus === ReservationStatus.CANCELED &&
      dto.endsAt == null
    ) {
      endsAt = new Date();
    }

    if (!holdOnly && endsAt <= startsAt) {
      throw new BadRequestException(
        'End time must be after start time (same day).',
      );
    }

    if (!holdOnly) {
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
        holdOnly ? startsAt : endsAt,
      );
    }
    const updateData = {
      ...(dto.resourceId !== undefined && { resourceId: dto.resourceId }),
      ...(dto.guestName != null && { guestName: dto.guestName }),
      ...(dto.guestEmail !== undefined && { guestEmail: dto.guestEmail }),
      ...(dto.guestPhone !== undefined && { guestPhone: dto.guestPhone }),
      ...(dto.partySize != null && { partySize: dto.partySize }),
      ...(dto.startsAt != null && { startsAt }),
      ...((dto.endsAt != null ||
        dto.startsAt != null ||
        dto.status != null ||
        holdOnly) && { endsAt }),
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
    const updateVersioned = async (db: Prisma.TransactionClient) => {
      const claimed = await db.reservation.updateMany({
        where: { id, shopId, version: dto.expectedVersion },
        data: { ...updateData, version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        const current = await db.reservation.findFirst({
          where: { id, shopId },
          select: { version: true },
        });
        assertExpectedVersion(
          current?.version ?? dto.expectedVersion + 1,
          dto.expectedVersion,
          { aggregateType: 'reservation', aggregateId: id },
        );
      }
      return db.reservation.findFirstOrThrow({
        where: { id, shopId },
        include: { resource: { include: { category: true } } },
      });
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
          return updateVersioned(tx);
        })
      : await this.prisma.$transaction((tx) => updateVersioned(tx));
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

  async delete(actor: JwtAccessPayload, id: string, dto: DeleteReservationDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    await assertShopFeature(this.prisma, shopId, 'reservation');
    const existing = await this.prisma.reservation.findFirst({
      where: { id, shopId },
      include: { resource: { include: { category: true } } },
    });
    if (!existing) throw new NotFoundException('Reservation not found');
    assertExpectedVersion(existing.version, dto.expectedVersion, {
      aggregateType: 'reservation',
      aggregateId: id,
    });

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

    const deleted = await this.prisma.reservation.deleteMany({
      where: { id, shopId, version: dto.expectedVersion },
    });
    if (deleted.count !== 1) {
      const current = await this.prisma.reservation.findFirst({
        where: { id, shopId },
        select: { version: true },
      });
      assertExpectedVersion(
        current?.version ?? dto.expectedVersion + 1,
        dto.expectedVersion,
        { aggregateType: 'reservation', aggregateId: id },
      );
    }

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
