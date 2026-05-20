import {

  BadRequestException,

  ForbiddenException,

  Injectable,

  NotFoundException,

} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

import { requireShopId } from "../../common/tenant";

import { AuditService } from "../audit/audit.service";

import type { JwtAccessPayload } from "../auth/auth.service";

import {

  CreateSeatingTableGroupDto,

  UpdateSeatingTableGroupDto,

} from "./dto/seating-tables.dto";



function defaultLabel(capacity: number) {

  return `Table for ${capacity}`;

}



function normalizeCounts(total: number, available: number) {

  const totalCount = Math.max(0, total);

  const availableCount = Math.min(Math.max(0, available), totalCount);

  return { totalCount, availableCount };

}



function parseEventRange(

  startsAt?: string,

  endsAt?: string,

): { eventStartsAt: Date | null; eventEndsAt: Date | null } {

  const eventStartsAt = startsAt ? new Date(startsAt) : null;

  const eventEndsAt = endsAt ? new Date(endsAt) : null;

  if (eventStartsAt && Number.isNaN(eventStartsAt.getTime())) {

    throw new BadRequestException("Invalid event start date/time.");

  }

  if (eventEndsAt && Number.isNaN(eventEndsAt.getTime())) {

    throw new BadRequestException("Invalid event end date/time.");

  }

  if (eventStartsAt && eventEndsAt && eventEndsAt <= eventStartsAt) {

    throw new BadRequestException("Event end must be after start.");

  }

  return { eventStartsAt, eventEndsAt };

}



@Injectable()

export class SeatingTablesService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly audit: AuditService,

  ) {}



  private assertWrite(actor: JwtAccessPayload) {

    if (!actor.shopId) throw new ForbiddenException();

    const p = actor.perms ?? "";

    if (p !== "*" && !p.split(",").includes("reservation.write")) {

      throw new ForbiddenException("Missing reservation.write");

    }

  }



  private async shopFloorCount(shopId: string) {

    const shop = await this.prisma.shop.findUnique({

      where: { id: shopId },

      select: { floorCount: true },

    });

    return Math.max(1, Math.min(10, shop?.floorCount ?? 1));

  }



  private resolveFloor(

    requested: number | undefined,

    maxFloors: number,

    fallback = 1,

  ) {

    const floor = requested ?? fallback;

    if (!Number.isInteger(floor) || floor < 1 || floor > maxFloors) {

      throw new BadRequestException(

        `Floor must be between 1 and ${maxFloors}.`,

      );

    }

    return floor;

  }



  async list(actor: JwtAccessPayload) {

    const shopId = requireShopId(actor);

    const floorCount = await this.shopFloorCount(shopId);

    const groups = await this.prisma.seatingTableGroup.findMany({

      where: { shopId },

      orderBy: [

        { floor: "asc" },

        { zone: "asc" },

        { sortOrder: "asc" },

        { capacity: "asc" },

        { label: "asc" },

      ],

    });

    const emptySummary = () => ({

      totalTables: 0,

      availableTables: 0,

      totalSeats: 0,

      availableSeats: 0,

    });

    const summary = groups.reduce(

      (acc, g) => {

        acc.totalTables += g.totalCount;

        acc.availableTables += g.availableCount;

        acc.totalSeats += g.totalCount * g.capacity;

        acc.availableSeats += g.availableCount * g.capacity;

        return acc;

      },

      emptySummary(),

    );

    const byZone = {

      INDOOR: emptySummary(),

      OUTDOOR: emptySummary(),

    };

    for (const g of groups) {

      const zoneKey = g.zone === "OUTDOOR" ? "OUTDOOR" : "INDOOR";

      const z = byZone[zoneKey];

      z.totalTables += g.totalCount;

      z.availableTables += g.availableCount;

      z.totalSeats += g.totalCount * g.capacity;

      z.availableSeats += g.availableCount * g.capacity;

    }

    return { groups, summary, byZone, floorCount };

  }



  async create(actor: JwtAccessPayload, dto: CreateSeatingTableGroupDto) {

    this.assertWrite(actor);

    const shopId = actor.shopId!;

    const maxFloors = await this.shopFloorCount(shopId);

    const { totalCount, availableCount } = normalizeCounts(

      dto.totalCount,

      dto.availableCount ?? dto.totalCount,

    );

    const isCustom = dto.isCustom ?? false;

    const label =

      dto.label?.trim() ||

      (isCustom ? "Custom seating" : defaultLabel(dto.capacity));

    const eventRange = parseEventRange(dto.eventStartsAt, dto.eventEndsAt);



    const maxSort = await this.prisma.seatingTableGroup.aggregate({

      where: { shopId },

      _max: { sortOrder: true },

    });



    const zone = dto.zone ?? "INDOOR";

    const floor = this.resolveFloor(dto.floor, maxFloors, 1);



    const row = await this.prisma.seatingTableGroup.create({

      data: {

        shopId,

        zone,

        floor,

        label,

        capacity: dto.capacity,

        totalCount,

        availableCount,

        note: dto.note?.trim() || null,

        isCustom,

        eventStartsAt: isCustom ? eventRange.eventStartsAt : null,

        eventEndsAt: isCustom ? eventRange.eventEndsAt : null,

        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,

      },

    });



    await this.audit.record(actor, {

      section: "reservation",

      action: "seating.create",

      summary: `Added seating group "${label}"`,

      meta: { groupId: row.id, capacity: row.capacity, floor: row.floor },

    });



    return row;

  }



  async update(

    actor: JwtAccessPayload,

    id: string,

    dto: UpdateSeatingTableGroupDto,

  ) {

    this.assertWrite(actor);

    const shopId = actor.shopId!;

    const maxFloors = await this.shopFloorCount(shopId);

    const existing = await this.ensureGroup(shopId, id);



    const totalCount =

      dto.totalCount != null ? dto.totalCount : existing.totalCount;

    let availableCount =

      dto.availableCount != null

        ? dto.availableCount

        : existing.availableCount;

    const normalized = normalizeCounts(totalCount, availableCount);

    if (dto.totalCount != null && dto.availableCount == null) {

      availableCount = Math.min(existing.availableCount, normalized.totalCount);

    } else {

      availableCount = normalized.availableCount;

    }



    const eventPatch =

      dto.eventStartsAt !== undefined || dto.eventEndsAt !== undefined

        ? parseEventRange(

            dto.eventStartsAt !== undefined

              ? dto.eventStartsAt ?? undefined

              : existing.eventStartsAt?.toISOString(),

            dto.eventEndsAt !== undefined

              ? dto.eventEndsAt ?? undefined

              : existing.eventEndsAt?.toISOString(),

          )

        : null;



    const floor =

      dto.floor != null

        ? this.resolveFloor(dto.floor, maxFloors, existing.floor)

        : undefined;



    const row = await this.prisma.seatingTableGroup.update({

      where: { id },

      data: {

        ...(dto.label != null && { label: dto.label.trim() || existing.label }),

        ...(dto.capacity != null && { capacity: dto.capacity }),

        ...(dto.totalCount != null && { totalCount: normalized.totalCount }),

        ...(dto.availableCount != null || dto.totalCount != null

          ? { availableCount }

          : {}),

        ...(dto.note !== undefined && {

          note: dto.note?.trim() || null,

        }),

        ...(dto.zone != null && { zone: dto.zone }),

        ...(floor != null && { floor }),

        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),

        ...(eventPatch && {

          eventStartsAt: eventPatch.eventStartsAt,

          eventEndsAt: eventPatch.eventEndsAt,

        }),

      },

    });



    await this.audit.record(actor, {

      section: "reservation",

      action: "seating.update",

      summary: `Updated seating "${row.label}" (${row.availableCount}/${row.totalCount} free)`,

      meta: { groupId: row.id, floor: row.floor },

    });



    return row;

  }



  async delete(actor: JwtAccessPayload, id: string) {

    this.assertWrite(actor);

    const shopId = actor.shopId!;

    const existing = await this.ensureGroup(shopId, id);

    await this.prisma.seatingTableGroup.delete({ where: { id } });

    await this.audit.record(actor, {

      section: "reservation",

      action: "seating.delete",

      summary: `Removed seating group "${existing.label}"`,

      meta: { groupId: id },

    });

    return { ok: true };

  }



  private async ensureGroup(shopId: string, id: string) {

    const row = await this.prisma.seatingTableGroup.findFirst({

      where: { id, shopId },

    });

    if (!row) throw new NotFoundException("Seating group not found.");

    return row;

  }

}

