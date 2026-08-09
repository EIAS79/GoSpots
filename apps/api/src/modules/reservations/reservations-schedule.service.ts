import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { serializeMoney } from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { assertShopFeature } from '../../common/subscription-feature.util';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  ACTIVE_RESERVATION,
  computeUnitFloorStatus,
} from '../../common/booking-floor-status';
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
  FEATURED_GAME_TYPES,
} from '../../common/booking-unit-kind';
import { ScheduleQueryDto } from './dto/reservations.dto';
import { isDiningResourceType } from '../../common/dining-reservation.util';

/**
 * Staff + public schedule builder API surface.
 *
 * Extracted from `ReservationsService` as part of Bible §14 (reservations
 * capability split). `ReservationsService` still facade-delegates
 * `getSchedule` / `getPublicSchedule` so controllers and existing callers
 * are unaffected.
 */
@Injectable()
export class ReservationsScheduleService {
  private readonly logger = new Logger(ReservationsScheduleService.name);

  /** Defensive cap on day-window reservation / walk-in rows (time already bounds). */
  static readonly SCHEDULE_DAY_QUERY_TAKE = 2000;

  /** Trimmed category tree — only fields mapped into schedule wire. */
  static readonly SCHEDULE_CATEGORY_SELECT =
    Prisma.validator<Prisma.ResourceCategorySelect>()({
      id: true,
      name: true,
      type: true,
      slotMinutes: true,
      bookingMode: true,
      offeringConfig: true,
      sortOrder: true,
      resources: {
        select: {
          id: true,
          name: true,
          status: true,
          capacity: true,
          sortOrder: true,
          section: {
            select: {
              id: true,
              name: true,
              floor: true,
              isVip: true,
              seatsPerRow: true,
              hourlyPriceAddon: true,
              zone: true,
            },
          },
          tableGroup: {
            select: {
              id: true,
              name: true,
              capacity: true,
              seatsPerRow: true,
              sortOrder: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
      gamingSections: {
        select: {
          id: true,
          name: true,
          floor: true,
          isVip: true,
          seatsPerRow: true,
              hourlyPriceAddon: true,
          sortOrder: true,
          zone: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    });

  constructor(private readonly prisma: PrismaService) {}

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
    if (deltaDays < -ReservationsScheduleService.SCHEDULE_PAST_DAYS) {
      throw new BadRequestException(
        'Schedule date is too far in the past.',
      );
    }
    if (deltaDays > ReservationsScheduleService.SCHEDULE_FUTURE_DAYS) {
      throw new BadRequestException(
        'Schedule date is too far in the future.',
      );
    }
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
      select: ReservationsScheduleService.SCHEDULE_CATEGORY_SELECT,
      orderBy: { sortOrder: 'asc' },
    });

    if (options?.kind === 'dining') {
      categories = categories.filter((c) => isDiningResourceType(c.type));
    } else if (options?.kind === 'gaming') {
      categories = categories.filter((c) => this.isGamingResourceType(c.type));
    }

    const resourceIds = categories.flatMap((c) => c.resources.map((r) => r.id));

    const scheduleTake = ReservationsScheduleService.SCHEDULE_DAY_QUERY_TAKE;

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
          take: scheduleTake,
        })
      : [];

    if (reservations.length === scheduleTake) {
      this.logger.warn(
        `Schedule reservation query hit take cap (${scheduleTake}) for shop=${shopId} date=${query.date}; agenda may be incomplete.`,
      );
    }

    const walkInSessions = resourceIds.length
      ? await this.prisma.playSession.findMany({
          where: {
            shopId,
            resourceId: { in: resourceIds },
            status: 'ACTIVE',
            archivedAt: null,
            startedAt: { lte: dayEnd },
          },
          take: scheduleTake,
        })
      : [];

    if (walkInSessions.length === scheduleTake) {
      this.logger.warn(
        `Schedule walk-in query hit take cap (${scheduleTake}) for shop=${shopId} date=${query.date}; floor status may be incomplete.`,
      );
    }

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
            hourlyPriceAddon: serializeMoney(s.hourlyPriceAddon),
            seatsPerRow: s.seatsPerRow,
            sortOrder: s.sortOrder,
            zone: s.zone ?? null,
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
                    hourlyPriceAddon: serializeMoney(
                      unit.section.hourlyPriceAddon,
                    ),
                    seatsPerRow: unit.section.seatsPerRow,
                    zone: unit.section.zone ?? null,
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
}
