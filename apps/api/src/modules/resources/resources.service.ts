import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ReservationStatus,
  ResourceStatus,
  type ResourceType,
} from "@prisma/client";
import {
  FEATURED_GAME_TYPES,
  defaultUnitNamePrefix,
  featuredTypeSortIndex,
  getBookingUnitKind,
  getBookingUnitLabels,
} from "../../common/booking-unit-kind";
import { PrismaService } from "../../prisma/prisma.service";
import { requireShopId } from "../../common/tenant";
import { AuditService } from "../audit/audit.service";
import type { JwtAccessPayload } from "../auth/auth.service";
import {
  AddUnitsDto,
  CreateCategoryDto,
  ResourceRateDto,
  UpdateCategoryDto,
  UpdateResourceDto,
} from "./dto/resources.dto";
import { assertResourceImageFile, type ResourceImageUpload } from "./resources-upload.util";
import { MediaService } from "../media/media.service";

const ACTIVE_RESERVATION: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? "";
    if (p !== "*" && !p.split(",").includes("resource.write")) {
      throw new ForbiddenException("Missing resource.write");
    }
  }

  async getCatalog(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const categories = await this.prisma.resourceCategory.findMany({
      where: { shopId },
      include: {
        rates: { orderBy: { sortOrder: "asc" } },
        resources: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
      orderBy: { sortOrder: "asc" },
    });
    const uncategorized = await this.prisma.resource.findMany({
      where: { shopId, categoryId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { categories, uncategorized };
  }

  async getGamingMenu(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const catalog = await this.getCatalog(actor);
    const now = new Date();

    const resourceIds = catalog.categories.flatMap((c) =>
      c.resources.map((r) => r.id),
    );

    const activeReservations = resourceIds.length
      ? await this.prisma.reservation.findMany({
          where: {
            shopId,
            resourceId: { in: resourceIds },
            status: { in: ACTIVE_RESERVATION },
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
          select: { resourceId: true, status: true },
        })
      : [];

    const reservedIds = new Set(
      activeReservations.map((r) => r.resourceId).filter(Boolean) as string[],
    );
    const inUseIds = new Set(
      activeReservations
        .filter((r) => r.status === ReservationStatus.CHECKED_IN)
        .map((r) => r.resourceId)
        .filter(Boolean) as string[],
    );

    const offerings = catalog.categories
      .map((cat) => {
        const unitKind = getBookingUnitKind(cat.type);
        const unitLabels = getBookingUnitLabels(unitKind);
        let availableNow = 0;
        let reservedNow = 0;
        let inUseNow = 0;
        let maintenance = 0;

        for (const unit of cat.resources) {
          if (unit.status === ResourceStatus.MAINTENANCE) {
            maintenance += 1;
            continue;
          }
          if (inUseIds.has(unit.id)) inUseNow += 1;
          else if (reservedIds.has(unit.id)) reservedNow += 1;
          else availableNow += 1;
        }

        return {
          id: cat.id,
          type: cat.type,
          name: cat.name,
          description: cat.description,
          imageUrl: cat.imageUrl,
          imageUrl2: cat.imageUrl2,
          slotMinutes: cat.slotMinutes,
          sortOrder: cat.sortOrder,
          unitKind,
          unitLabels,
          rates: cat.rates,
          inventory: {
            total: cat.resources.length,
            availableNow,
            reservedNow,
            inUseNow,
            maintenance,
          },
        };
      })
      .sort((a, b) => featuredTypeSortIndex(a.type) - featuredTypeSortIndex(b.type));

    const configuredTypes = new Set(offerings.map((o) => o.type));
    const availableToAdd = FEATURED_GAME_TYPES.filter(
      (t) => !configuredTypes.has(t),
    );

    return { offerings, availableToAdd };
  }

  async createCategory(actor: JwtAccessPayload, dto: CreateCategoryDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const category = await this.prisma.resourceCategory.create({
      data: {
        shopId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
        slotMinutes: dto.slotMinutes ?? 60,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    if (dto.rates?.length) {
      await this.syncRates(category.id, dto.rates);
    }
    if (dto.unitCount && dto.unitCount > 0) {
      await this.addUnitsInternal(
        shopId,
        category.id,
        dto.type,
        dto.unitCount,
        dto.unitNamePrefix ??
          defaultUnitNamePrefix(dto.type, dto.name),
      );
    }
    await this.audit.record(actor, {
      section: "operations",
      action: "resource.category.create",
      summary: `Added game offering "${category.name}"`,
      meta: { categoryId: category.id, type: dto.type },
    });
    return this.getCategory(actor, category.id);
  }

  async updateCategory(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateCategoryDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const cat = await this.ensureCategory(shopId, id);
    await this.prisma.resourceCategory.update({
      where: { id },
      data: {
        ...(dto.type != null && { type: dto.type }),
        ...(dto.name != null && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.slotMinutes != null && { slotMinutes: dto.slotMinutes }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
    if (dto.type != null) {
      await this.prisma.resource.updateMany({
        where: { categoryId: id },
        data: { type: dto.type },
      });
    }
    if (dto.rates) await this.syncRates(id, dto.rates);
    if (dto.totalUnits != null) {
      const type = dto.type ?? cat.type;
      const name = dto.name ?? cat.name;
      await this.syncInventory(
        shopId,
        id,
        type,
        Math.max(0, Math.floor(dto.totalUnits)),
        defaultUnitNamePrefix(type, name),
      );
    }
    await this.audit.record(actor, {
      section: "operations",
      action: "resource.category.update",
      summary: `Updated game offering`,
      meta: { categoryId: id },
    });
    return this.getCategory(actor, id);
  }

  async deleteCategory(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const cat = await this.ensureCategory(actor.shopId!, id);
    await this.prisma.resourceCategory.delete({ where: { id } });
    await this.audit.record(actor, {
      section: "operations",
      action: "resource.category.delete",
      summary: `Removed game offering "${cat.name}"`,
      meta: { categoryId: id },
    });
    return { ok: true };
  }

  async addUnits(actor: JwtAccessPayload, categoryId: string, dto: AddUnitsDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const cat = await this.ensureCategory(shopId, categoryId);
    await this.addUnitsInternal(
      shopId,
      categoryId,
      cat.type,
      dto.count,
      dto.namePrefix ?? defaultUnitNamePrefix(cat.type, cat.name),
    );
    return this.getCategory(actor, categoryId);
  }

  async updateResource(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateResourceDto,
  ) {
    this.assertWrite(actor);
    await this.ensureResource(actor.shopId!, id);
    const resource = await this.prisma.resource.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.hourlyRate != null && { hourlyRate: dto.hourlyRate }),
        ...(dto.status != null && { status: dto.status as ResourceStatus }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
    return resource;
  }

  async deleteResource(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const r = await this.ensureResource(actor.shopId!, id);
    await this.prisma.resource.delete({ where: { id } });
    await this.audit.record(actor, {
      section: "operations",
      action: "resource.unit.delete",
      summary: `Removed unit "${r.name}"`,
      meta: { resourceId: id },
    });
    return { ok: true };
  }

  async uploadCategoryImage(
    actor: JwtAccessPayload,
    categoryId: string,
    slot: "1" | "2",
    file: ResourceImageUpload,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const cat = await this.ensureCategory(shopId, categoryId);
    assertResourceImageFile(file);
    const oldUrl = slot === "1" ? cat.imageUrl : cat.imageUrl2;
    const url = await this.media.replaceMediaPath(shopId, oldUrl, file);
    const data = slot === "1" ? { imageUrl: url } : { imageUrl2: url };
    await this.prisma.resourceCategory.update({
      where: { id: categoryId },
      data,
    });
    return this.getCategory(actor, categoryId);
  }

  private async getCategory(actor: JwtAccessPayload, id: string) {
    const cat = await this.prisma.resourceCategory.findFirst({
      where: { id, shopId: actor.shopId! },
      include: {
        rates: { orderBy: { sortOrder: "asc" } },
        resources: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });
    if (!cat) throw new NotFoundException("Category not found");
    return cat;
  }

  private async syncRates(categoryId: string, rates: ResourceRateDto[]) {
    await this.prisma.resourceRate.deleteMany({ where: { categoryId } });
    if (rates.length) {
      await this.prisma.resourceRate.createMany({
        data: rates.map((r, i) => ({
          categoryId,
          label: r.label,
          durationMinutes: r.durationMinutes ?? null,
          price: r.price,
          sortOrder: r.sortOrder ?? i,
        })),
      });
    }
  }

  private async syncInventory(
    shopId: string,
    categoryId: string,
    type: ResourceType,
    targetTotal: number,
    namePrefix: string,
  ) {
    const resources = await this.prisma.resource.findMany({
      where: { categoryId, shopId },
      orderBy: [{ sortOrder: "desc" }, { name: "asc" }],
    });
    const current = resources.length;
    if (targetTotal === current) return;

    if (targetTotal > current) {
      await this.addUnitsInternal(
        shopId,
        categoryId,
        type,
        targetTotal - current,
        namePrefix,
      );
      return;
    }

    const toRemove = current - targetTotal;
    const now = new Date();
    const removable = resources.slice(0, toRemove);

    for (const unit of removable) {
      const active = await this.prisma.reservation.findFirst({
        where: {
          resourceId: unit.id,
          status: { in: ACTIVE_RESERVATION },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      });
      if (active) {
        throw new BadRequestException(
          `Cannot remove ${unit.name} — it has an active booking. Cancel the reservation first or lower the count less.`,
        );
      }
    }

    await this.prisma.resource.deleteMany({
      where: { id: { in: removable.map((r) => r.id) } },
    });
  }

  private async addUnitsInternal(
    shopId: string,
    categoryId: string,
    type: ResourceType,
    count: number,
    namePrefix: string,
  ) {
    const existing = await this.prisma.resource.count({
      where: { categoryId },
    });
    const defaultRate = await this.prisma.resourceRate.findFirst({
      where: { categoryId },
      orderBy: { sortOrder: "asc" },
    });
    const hourly =
      defaultRate?.durationMinutes && defaultRate.durationMinutes > 0
        ? (defaultRate.price / defaultRate.durationMinutes) * 60
        : defaultRate?.price ?? 0;

    const rows = Array.from({ length: count }, (_, i) => {
      const n = existing + i + 1;
      const padded = String(n).padStart(2, "0");
      return {
        shopId,
        categoryId,
        type,
        name: `${namePrefix} ${padded}`,
        hourlyRate: hourly,
        sortOrder: n,
      };
    });
    await this.prisma.resource.createMany({ data: rows });
  }

  private async ensureCategory(shopId: string, id: string) {
    const c = await this.prisma.resourceCategory.findFirst({
      where: { id, shopId },
    });
    if (!c) throw new NotFoundException("Category not found");
    return c;
  }

  private async ensureResource(shopId: string, id: string) {
    const r = await this.prisma.resource.findFirst({ where: { id, shopId } });
    if (!r) throw new NotFoundException("Resource not found");
    return r;
  }
}
