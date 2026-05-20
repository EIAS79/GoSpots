import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ReservationStatus, ResourceStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { requireShopId } from "../../common/tenant";
import { AuditService } from "../audit/audit.service";
import type { JwtAccessPayload } from "../auth/auth.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  ACTIVE_RESERVATION,
  computeUnitFloorStatus,
  dayBoundsLocal,
} from "../../common/booking-floor-status";
import {
  getBookingUnitKind,
  getBookingUnitLabels,
  featuredTypeSortIndex,
} from "../../common/booking-unit-kind";
import {
  CreateReservationDto,
  ReservationQueryDto,
  ScheduleQueryDto,
  UpdateReservationDto,
} from "./dto/reservations.dto";

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private formatWindow(startsAt: Date, endsAt: Date) {
    const date = startsAt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const start = startsAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const end = endsAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${date} · ${start}–${end}`;
  }

  private bookingHref(startsAt: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}`;
    return `/sessions?tab=schedule&date=${date}`;
  }

  private async logBooking(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    await this.audit.record(actor, {
      section: "reservation",
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
  ) {
    if (!staffAlert) return;
    await this.notifications.recordReservationEvent(shopId, {
      title,
      body,
      href: this.bookingHref(startsAt),
    });
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? "";
    if (p !== "*" && !p.split(",").includes("reservation.write")) {
      throw new ForbiddenException("Missing reservation.write");
    }
  }

  async list(actor: JwtAccessPayload, query: ReservationQueryDto) {
    const shopId = requireShopId(actor);
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
      orderBy: { startsAt: "asc" },
      take: 500,
    });
    return { reservations: rows };
  }

  async getSchedule(actor: JwtAccessPayload, query: ScheduleQueryDto) {
    const shopId = requireShopId(actor);
    let dayStart: Date;
    let dayEnd: Date;
    try {
      ({ dayStart, dayEnd } = dayBoundsLocal(query.date));
    } catch {
      throw new BadRequestException("Invalid date");
    }

    const categories = await this.prisma.resourceCategory.findMany({
      where: {
        shopId,
        ...(query.categoryId ? { id: query.categoryId } : {}),
      },
      include: {
        resources: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
      orderBy: { sortOrder: "asc" },
    });

    const resourceIds = categories.flatMap((c) =>
      c.resources.map((r) => r.id),
    );

    const reservations = resourceIds.length
      ? await this.prisma.reservation.findMany({
          where: {
            shopId,
            resourceId: { in: resourceIds },
            status: { in: ACTIVE_RESERVATION },
            startsAt: { lte: dayEnd },
            endsAt: { gte: dayStart },
          },
          orderBy: { startsAt: "asc" },
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
      units: cat.resources.map((unit) => {
        const bookings = byResource.get(unit.id) ?? [];
        const floorStatus = computeUnitFloorStatus(
          unit.status,
          bookings,
          now,
          query.date,
        );
        return {
          id: unit.id,
          name: unit.name,
          status: unit.status,
          floorStatus,
          bookings: bookings.map((b) => ({
            id: b.id,
            guestName: b.guestName,
            guestEmail: b.guestEmail,
            guestPhone: b.guestPhone,
            partySize: b.partySize,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
            status: b.status,
            notes: b.notes,
            staffAlert: b.staffAlert,
          })),
        };
      }),
    };
      })
      .sort((a, b) => featuredTypeSortIndex(a.type) - featuredTypeSortIndex(b.type));

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
        guestName: b.guestName,
        guestEmail: b.guestEmail,
        guestPhone: b.guestPhone,
        partySize: b.partySize,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: b.status,
        notes: b.notes,
        staffAlert: b.staffAlert,
        resourceId: b.resourceId,
        unitName: b.resourceId
          ? (resourceNameById.get(b.resourceId) ?? null)
          : null,
        categoryId:
          categories.find((c) =>
            c.resources.some((r) => r.id === b.resourceId),
          )?.id ?? null,
        categoryName:
          categories.find((c) =>
            c.resources.some((r) => r.id === b.resourceId),
          )?.name ?? null,
      }))
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );

    const freeCount = categoriesOut.reduce(
      (sum, c) =>
        sum + c.units.filter((u) => u.floorStatus === "AVAILABLE").length,
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
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        "End time must be after start time (same day).",
      );
    }
    const maxSpanMs = 24 * 60 * 60 * 1000;
    if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
      throw new BadRequestException(
        "A single booking cannot span more than 24 hours.",
      );
    }
    if (dto.resourceId) {
      await this.assertNoOverlap(shopId, dto.resourceId, startsAt, endsAt);
      await this.ensureResource(shopId, dto.resourceId);
    }
    const row = await this.prisma.reservation.create({
      data: {
        shopId,
        resourceId: dto.resourceId,
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone,
        partySize: dto.partySize ?? 1,
        startsAt,
        endsAt,
        status: dto.status ?? ReservationStatus.CONFIRMED,
        staffAlert: dto.staffAlert ?? false,
        notes: dto.notes,
      },
      include: { resource: { include: { category: true } } },
    });
    const unitLabel = row.resource?.name ?? "unassigned unit";
    const window = this.formatWindow(row.startsAt, row.endsAt);
    await this.logBooking(actor, "reservation.create", `Scheduled ${row.guestName} on ${unitLabel} (${window})`, {
      reservationId: row.id,
      resourceId: row.resourceId,
      guestName: row.guestName,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      staffAlert: row.staffAlert,
    });
    await this.maybeNotifyStaff(
      shopId,
      row.staffAlert,
      "New game booking",
      `${row.guestName} · ${unitLabel} · ${window}`,
      row.startsAt,
    );
    return row;
  }

  async update(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateReservationDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const existing = await this.ensureReservation(shopId, id);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    const resourceId =
      dto.resourceId !== undefined ? dto.resourceId : existing.resourceId;
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        "End time must be after start time (same day).",
      );
    }
    const maxSpanMs = 24 * 60 * 60 * 1000;
    if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
      throw new BadRequestException(
        "A single booking cannot span more than 24 hours.",
      );
    }
    if (resourceId) {
      await this.assertNoOverlap(shopId, resourceId, startsAt, endsAt, id);
    }
    const row = await this.prisma.reservation.update({
      where: { id },
      data: {
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
      },
      include: { resource: { include: { category: true } } },
    });
    if (
      dto.status === ReservationStatus.CHECKED_IN &&
      row.resourceId
    ) {
      await this.prisma.resource.update({
        where: { id: row.resourceId },
        data: { status: ResourceStatus.BUSY },
      });
    }
    if (
      dto.status === ReservationStatus.COMPLETED ||
      dto.status === ReservationStatus.CANCELED
    ) {
      if (row.resourceId) {
        await this.prisma.resource.update({
          where: { id: row.resourceId },
          data: { status: ResourceStatus.AVAILABLE },
        });
      }
    }
    const unitLabel = row.resource?.name ?? "unassigned unit";
    const window = this.formatWindow(row.startsAt, row.endsAt);
    const canceled =
      dto.status === ReservationStatus.CANCELED &&
      existing.status !== ReservationStatus.CANCELED;
    const action = canceled ? "reservation.cancel" : "reservation.update";
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
      await this.maybeNotifyStaff(
        shopId,
        true,
        canceled ? "Game booking canceled" : "Game booking updated",
        `${row.guestName} · ${unitLabel} · ${window}`,
        row.startsAt,
      );
    }

    return row;
  }

  async delete(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const existing = await this.ensureReservation(shopId, id);
    const resource = existing.resourceId
      ? await this.prisma.resource.findUnique({
          where: { id: existing.resourceId },
          select: { name: true },
        })
      : null;
    const unitLabel = resource?.name ?? "unassigned unit";
    const window = this.formatWindow(existing.startsAt, existing.endsAt);

    await this.prisma.reservation.delete({ where: { id } });

    await this.logBooking(
      actor,
      "reservation.delete",
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
      await this.maybeNotifyStaff(
        shopId,
        true,
        "Game booking removed",
        `${existing.guestName} · ${unitLabel} · ${window}`,
        existing.startsAt,
      );
    }

    return { ok: true };
  }

  private async assertNoOverlap(
    shopId: string,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    const clash = await this.prisma.reservation.findFirst({
      where: {
        shopId,
        resourceId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: ACTIVE_RESERVATION },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (clash) {
      throw new ConflictException(
        "This unit already has a booking that overlaps that time. Pick a different slot or unit.",
      );
    }
  }

  private async ensureResource(shopId: string, id: string) {
    const r = await this.prisma.resource.findFirst({ where: { id, shopId } });
    if (!r) throw new NotFoundException("Resource not found");
    return r;
  }

  private async ensureReservation(shopId: string, id: string) {
    const r = await this.prisma.reservation.findFirst({ where: { id, shopId } });
    if (!r) throw new NotFoundException("Reservation not found");
    return r;
  }
}
