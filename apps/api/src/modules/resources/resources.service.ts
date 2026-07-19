import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Prisma,
  ReservationStatus,
  ResourceStatus,
  type ResourceType,
} from '@prisma/client';
import {
  DINING_TYPES,
  FEATURED_GAME_TYPES,
  defaultUnitNamePrefix,
  featuredTypeSortIndex,
  getBookingUnitKind,
  getBookingUnitLabels,
} from '../../common/booking-unit-kind';
import { PrismaService } from '../../prisma/prisma.service';
import { requireShopId } from '../../common/tenant';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  AddUnitsDto,
  CreateCategoryDto,
  CreateGamingSectionDto,
  CreateDiningTableGroupDto,
  ResourceRateDto,
  UpdateCategoryDto,
  UpdateDiningTableGroupDto,
  UpdateGamingSectionDto,
  UpdateResourceDto,
} from './dto/resources.dto';
import {
  assertResourceImageFile,
  type ResourceImageUpload,
} from './resources-upload.util';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';

const ACTIVE_RESERVATION: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

function toInputJson(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? '';
    if (p !== '*' && !p.split(',').includes('resource.write')) {
      throw new ForbiddenException('Missing resource.write');
    }
  }

  async getCatalog(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const categories = await this.prisma.resourceCategory.findMany({
      where: { shopId },
      include: {
        rates: { orderBy: { sortOrder: 'asc' } },
        gamingSections: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        resources: {
          include: { section: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    const uncategorized = await this.prisma.resource.findMany({
      where: { shopId, categoryId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { categories, uncategorized };
  }

  async getGamingMenu(actor: JwtAccessPayload) {
    return this.buildVenueMenu(actor, FEATURED_GAME_TYPES);
  }

  async getDiningMenu(actor: JwtAccessPayload) {
    return this.buildVenueMenu(actor, DINING_TYPES);
  }

  private async buildVenueMenu(
    actor: JwtAccessPayload,
    allowedTypes: ResourceType[],
  ) {
    const catalog = await this.getCatalog(actor);
    const shopId = requireShopId(actor);
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
      .filter((cat) => allowedTypes.includes(cat.type))
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
          bookingMode: cat.bookingMode,
          name: cat.name,
          description: cat.description,
          imageUrl: cat.imageUrl,
          imageUrl2: cat.imageUrl2,
          slotMinutes: cat.slotMinutes,
          sortOrder: cat.sortOrder,
          playstationGames: cat.playstationGames,
          offeringConfig: cat.offeringConfig,
          unitKind,
          unitLabels,
          rates: cat.rates,
          sections: cat.gamingSections.map((s) => ({
            id: s.id,
            name: s.name,
            floor: s.floor,
            isVip: s.isVip,
            seatsPerRow: s.seatsPerRow,
            sortOrder: s.sortOrder,
            seatCount: cat.resources.filter((r) => r.sectionId === s.id).length,
          })),
          inventory: {
            total: cat.resources.length,
            availableNow,
            reservedNow,
            inUseNow,
            maintenance,
          },
        };
      })
      .sort(
        (a, b) => featuredTypeSortIndex(a.type) - featuredTypeSortIndex(b.type),
      );

    return {
      offerings,
      availableToAdd: allowedTypes.filter(
        (type) => !offerings.some((offering) => offering.type === type),
      ),
    };
  }

  async createCategory(actor: JwtAccessPayload, dto: CreateCategoryDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    await assertShopFeature(this.prisma, shopId, 'resource');
    if (FEATURED_GAME_TYPES.includes(dto.type) || DINING_TYPES.includes(dto.type)) {
      const existing = await this.prisma.resourceCategory.findFirst({
        where: { shopId, type: dto.type },
        select: { id: true },
      });
      if (existing) {
        const label = DINING_TYPES.includes(dto.type)
          ? 'dining room'
          : `${dto.type.toLowerCase()} arena`;
        throw new ConflictException(
          `A ${label} already exists. Add more zones from Layout & zones instead.`,
        );
      }
    }
    const category = await this.prisma.resourceCategory.create({
      data: {
        shopId,
        type: dto.type,
        bookingMode: dto.bookingMode ?? 'TIME',
        name: dto.name,
        description: dto.description,
        slotMinutes: dto.slotMinutes ?? 60,
        playstationGames: dto.playstationGames ?? [],
        offeringConfig: toInputJson(dto.offeringConfig),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    if (dto.rates?.length) {
      await this.syncRates(category.id, dto.rates);
    }
    if (dto.unitCount && dto.unitCount > 0 && !DINING_TYPES.includes(dto.type)) {
      const prefix =
        dto.unitNamePrefix ?? defaultUnitNamePrefix(dto.type, dto.name);
      await this.addUnitsInternal(
        shopId,
        category.id,
        dto.type,
        dto.unitCount,
        prefix,
        undefined,
        null,
      );
      const section = await this.prisma.gamingSection.create({
        data: {
          shopId,
          categoryId: category.id,
          name: 'Main area',
          floor: 1,
          seatsPerRow: 6,
        },
      });
      await this.prisma.resource.updateMany({
        where: { categoryId: category.id, shopId },
        data: { sectionId: section.id },
      });
    }
    await this.audit.record(actor, {
      section: 'operations',
      action: 'resource.category.create',
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
        ...(dto.bookingMode != null && { bookingMode: dto.bookingMode }),
        ...(dto.playstationGames !== undefined && {
          playstationGames: dto.playstationGames,
        }),
        ...(dto.offeringConfig !== undefined && {
          offeringConfig: toInputJson(dto.offeringConfig),
        }),
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
    if (dto.totalUnits != null && !DINING_TYPES.includes(cat.type)) {
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
      section: 'operations',
      action: 'resource.category.update',
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
      section: 'operations',
      action: 'resource.category.delete',
      summary: `Removed game offering "${cat.name}"`,
      meta: { categoryId: id },
    });
    return { ok: true };
  }

  async addUnits(
    actor: JwtAccessPayload,
    categoryId: string,
    dto: AddUnitsDto,
  ) {
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
    await this.audit.record(actor, {
      section: 'operations',
      action: 'resource.unit.add',
      summary: `Added ${dto.count} unit${dto.count === 1 ? '' : 's'} to "${cat.name}"`,
      meta: { categoryId, count: dto.count },
    });
    return this.getCategory(actor, categoryId);
  }

  async updateResource(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateResourceDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const existing = await this.ensureResource(shopId, id);
    if (dto.sectionId !== undefined && dto.sectionId !== null) {
      const section = await this.ensureSection(shopId, dto.sectionId);
      if (section.categoryId !== existing.categoryId) {
        throw new BadRequestException(
          'Unit can only be assigned to a section in the same category.',
        );
      }
    }
    const resource = await this.prisma.resource.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.hourlyRate != null && { hourlyRate: dto.hourlyRate }),
        ...(dto.status != null && { status: dto.status }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.sectionId !== undefined && { sectionId: dto.sectionId }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
      },
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'resource.unit.update',
      summary:
        dto.status === ResourceStatus.MAINTENANCE &&
        existing.status !== ResourceStatus.MAINTENANCE
          ? `Marked unit "${resource.name}" out of service`
          : dto.status === ResourceStatus.AVAILABLE &&
              existing.status === ResourceStatus.MAINTENANCE
            ? `Returned unit "${resource.name}" to service`
            : `Updated unit "${resource.name}"`,
      meta: {
        resourceId: id,
        ...(dto.status != null && { status: dto.status }),
      },
    });
    if (
      dto.status === ResourceStatus.MAINTENANCE &&
      existing.status !== ResourceStatus.MAINTENANCE
    ) {
      await this.notifications.recordOperationsEvent(shopId, {
        title: 'Unit out of service',
        body: `${resource.name} is marked maintenance and hidden from guest booking.`,
        href: '/resources',
        dedupeKey: `unit-maintenance:${id}`,
      });
    }
    return resource;
  }

  async deleteResource(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const r = await this.ensureResource(actor.shopId!, id);
    await this.prisma.resource.delete({ where: { id } });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'resource.unit.delete',
      summary: `Removed unit "${r.name}"`,
      meta: { resourceId: id },
    });
    return { ok: true };
  }

  async uploadCategoryImage(
    actor: JwtAccessPayload,
    categoryId: string,
    slot: '1' | '2',
    file: ResourceImageUpload,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const cat = await this.ensureCategory(shopId, categoryId);
    assertResourceImageFile(file);
    const oldUrl = slot === '1' ? cat.imageUrl : cat.imageUrl2;
    const url = await this.media.replaceMediaPath(shopId, oldUrl, file);
    const data = slot === '1' ? { imageUrl: url } : { imageUrl2: url };
    await this.prisma.resourceCategory.update({
      where: { id: categoryId },
      data,
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'resource.category.image',
      summary: `Updated offering image (slot ${slot})`,
      meta: { categoryId, slot },
    });
    return this.getCategory(actor, categoryId);
  }

  async listGamingSections(actor: JwtAccessPayload, categoryId?: string) {
    const shopId = requireShopId(actor);
    const sections = await this.prisma.gamingSection.findMany({
      where: {
        shopId,
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        resources: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        tableGroups: {
          orderBy: [{ sortOrder: 'asc' }],
          include: {
            resources: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
          },
        },
      },
      orderBy: [{ floor: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      sections: sections.map((s) => ({
        id: s.id,
        categoryId: s.categoryId,
        categoryName: s.category.name,
        categoryType: s.category.type,
        name: s.name,
        floor: s.floor,
        isVip: s.isVip,
        seatsPerRow: s.seatsPerRow,
        sortOrder: s.sortOrder,
        zone: s.zone,
        description: s.description,
        imageUrl: s.imageUrl,
        defaultTableCapacity: s.defaultTableCapacity,
        seatCount: s.resources.length,
        tableGroups: s.tableGroups.map((g) => ({
          id: g.id,
          sectionId: g.sectionId,
          name: g.name,
          capacity: g.capacity,
          description: g.description,
          imageUrl: g.imageUrl,
          seatsPerRow: g.seatsPerRow,
          sortOrder: g.sortOrder,
          tableCount: g.resources.length,
          units: g.resources.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            sortOrder: r.sortOrder,
            capacity: r.capacity,
          })),
        })),
        units: s.resources.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          sortOrder: r.sortOrder,
          capacity: r.capacity,
        })),
      })),
    };
  }

  async createGamingSection(
    actor: JwtAccessPayload,
    dto: CreateGamingSectionDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const cat = await this.ensureCategory(shopId, dto.categoryId);
    const maxSort = await this.prisma.gamingSection.aggregate({
      where: { categoryId: cat.id },
      _max: { sortOrder: true },
    });
    const floor = Math.min(Math.max(dto.floor ?? 1, 1), 10);
    const isDining = cat.type === 'DINING';
    const section = await this.prisma.gamingSection.create({
      data: {
        shopId,
        categoryId: cat.id,
        name: dto.name.trim(),
        floor,
        isVip: dto.isVip ?? false,
        seatsPerRow: dto.seatsPerRow ?? (isDining ? 4 : 6),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        ...(isDining && {
          zone: dto.zone === 'OUTDOOR' ? 'OUTDOOR' : 'INDOOR',
        }),
      },
    });
    if (dto.seatCount && dto.seatCount > 0 && !isDining) {
      await this.addUnitsInternal(
        shopId,
        cat.id,
        cat.type,
        dto.seatCount,
        defaultUnitNamePrefix(cat.type, cat.name),
        section.id,
        null,
      );
    }
    if (isDining) {
      await this.syncShopFloorFromDiningSections(shopId);
    }
    await this.audit.record(actor, {
      section: 'operations',
      action: 'gaming.section.create',
      summary: `Added gaming zone "${section.name}"`,
      meta: { sectionId: section.id, categoryId: cat.id },
    });
    return this.listGamingSections(actor, cat.id);
  }

  async updateGamingSection(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateGamingSectionDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const existing = await this.prisma.gamingSection.findFirst({
      where: { id, shopId },
      include: { category: true },
    });
    if (!existing) throw new NotFoundException('Gaming section not found.');

    await this.prisma.gamingSection.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.floor != null && {
          floor: Math.min(Math.max(dto.floor, 1), 10),
        }),
        ...(dto.isVip != null && { isVip: dto.isVip }),
        ...(dto.seatsPerRow != null && { seatsPerRow: dto.seatsPerRow }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.zone != null && {
          zone: dto.zone === 'OUTDOOR' ? 'OUTDOOR' : 'INDOOR',
        }),
        ...(dto.description != null && {
          description: dto.description.trim() || null,
        }),
        ...(dto.defaultTableCapacity != null && {
          defaultTableCapacity: dto.defaultTableCapacity,
        }),
      },
    });

    if (
      existing.category.type === 'DINING' &&
      dto.defaultTableCapacity != null
    ) {
      // Table capacity is managed per table group, not per section.
    } else if (dto.defaultTableCapacity != null) {
      await this.prisma.resource.updateMany({
        where: { sectionId: id, shopId },
        data: { capacity: dto.defaultTableCapacity },
      });
    }

    if (dto.seatCount != null && existing.category.type !== 'DINING') {
      const sectionCapacity =
        dto.defaultTableCapacity ?? existing.defaultTableCapacity ?? null;
      await this.syncSectionInventory(
        shopId,
        existing.categoryId,
        existing.category.type,
        id,
        Math.max(0, Math.floor(dto.seatCount)),
        defaultUnitNamePrefix(existing.category.type, existing.category.name),
        sectionCapacity,
      );
    }

    if (existing.category.type === 'DINING') {
      await this.syncShopFloorFromDiningSections(shopId);
    }

    await this.audit.record(actor, {
      section: 'operations',
      action: 'gaming.section.update',
      summary: `Updated zone "${existing.name}"`,
      meta: { sectionId: id, categoryId: existing.categoryId },
    });

    return this.listGamingSections(actor, existing.categoryId);
  }

  async deleteGamingSection(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const section = await this.prisma.gamingSection.findFirst({
      where: { id, shopId },
    });
    if (!section) throw new NotFoundException('Gaming section not found.');

    const unitCount = await this.prisma.resource.count({
      where: { sectionId: id },
    });
    if (unitCount > 0) {
      throw new BadRequestException(
        'Remove or move seats before deleting this zone.',
      );
    }

    await this.prisma.gamingSection.delete({ where: { id } });
    const cat = await this.prisma.resourceCategory.findUnique({
      where: { id: section.categoryId },
      select: { type: true },
    });
    if (cat?.type === 'DINING') {
      await this.syncShopFloorFromDiningSections(shopId);
    }
    await this.audit.record(actor, {
      section: 'operations',
      action: 'gaming.section.delete',
      summary: `Removed zone "${section.name}"`,
      meta: { sectionId: id, categoryId: section.categoryId },
    });
    await this.notifications.recordOperationsEvent(shopId, {
      title: 'Zone removed',
      body: `"${section.name}" was deleted from your layout.`,
      href: '/resources',
      dedupeKey: `section-delete:${id}`,
    });
    return { ok: true };
  }

  async uploadGamingSectionImage(
    actor: JwtAccessPayload,
    sectionId: string,
    file: ResourceImageUpload,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const section = await this.prisma.gamingSection.findFirst({
      where: { id: sectionId, shopId },
    });
    if (!section) throw new NotFoundException('Gaming section not found.');
    assertResourceImageFile(file);
    const url = await this.media.replaceMediaPath(shopId, section.imageUrl, file);
    await this.prisma.gamingSection.update({
      where: { id: sectionId },
      data: { imageUrl: url },
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'gaming.section.image',
      summary: `Updated zone image for "${section.name}"`,
      meta: { sectionId },
    });
    return this.listGamingSections(actor, section.categoryId);
  }

  async createDiningTableGroup(
    actor: JwtAccessPayload,
    dto: CreateDiningTableGroupDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const section = await this.prisma.gamingSection.findFirst({
      where: { id: dto.sectionId, shopId },
      include: { category: true },
    });
    if (!section) throw new NotFoundException('Dining area not found.');
    if (section.category.type !== 'DINING') {
      throw new BadRequestException('Table groups are only for dining areas.');
    }

    const maxSort = await this.prisma.diningTableGroup.aggregate({
      where: { sectionId: section.id },
      _max: { sortOrder: true },
    });
    const capacity = Math.min(Math.max(dto.capacity, 1), 8);
    const group = await this.prisma.diningTableGroup.create({
      data: {
        shopId,
        sectionId: section.id,
        name: dto.name?.trim() || `${capacity}-seat table`,
        capacity,
        description: dto.description?.trim() || null,
        seatsPerRow: dto.seatsPerRow ?? 4,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    await this.addUnitsInternal(
      shopId,
      section.categoryId,
      'DINING',
      dto.tableCount,
      'Table',
      section.id,
      capacity,
      group.id,
    );

    await this.audit.record(actor, {
      section: 'operations',
      action: 'dining.table_group.create',
      summary: `Added ${dto.tableCount}× ${capacity}-seat tables to "${section.name}"`,
      meta: { groupId: group.id, sectionId: section.id },
    });

    return this.listGamingSections(actor, section.categoryId);
  }

  async updateDiningTableGroup(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateDiningTableGroupDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const group = await this.prisma.diningTableGroup.findFirst({
      where: { id, shopId },
      include: { section: { include: { category: true } } },
    });
    if (!group) throw new NotFoundException('Table group not found.');

    const capacity =
      dto.capacity != null
        ? Math.min(Math.max(dto.capacity, 1), 8)
        : group.capacity;

    await this.prisma.diningTableGroup.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() || `${capacity}-seat table` }),
        ...(dto.capacity != null && { capacity }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.seatsPerRow != null && { seatsPerRow: dto.seatsPerRow }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });

    if (dto.capacity != null && dto.capacity !== group.capacity) {
      await this.prisma.resource.updateMany({
        where: { tableGroupId: id, shopId },
        data: { capacity },
      });
    }

    if (dto.tableCount != null) {
      await this.syncTableGroupInventory(
        shopId,
        group.section.categoryId,
        id,
        group.sectionId,
        Math.max(0, Math.floor(dto.tableCount)),
        capacity,
      );
    }

    await this.audit.record(actor, {
      section: 'operations',
      action: 'dining.table_group.update',
      summary: `Updated table group "${group.name}"`,
      meta: { groupId: id, sectionId: group.sectionId },
    });

    return this.listGamingSections(actor, group.section.categoryId);
  }

  async deleteDiningTableGroup(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const group = await this.prisma.diningTableGroup.findFirst({
      where: { id, shopId },
      include: { section: { select: { categoryId: true } } },
    });
    if (!group) throw new NotFoundException('Table group not found.');

    const resources = await this.prisma.resource.findMany({
      where: { tableGroupId: id, shopId },
    });
    const now = new Date();
    for (const unit of resources) {
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
          `Cannot remove ${unit.name} — it has an active booking.`,
        );
      }
    }

    await this.prisma.resource.deleteMany({ where: { tableGroupId: id, shopId } });
    await this.prisma.diningTableGroup.delete({ where: { id } });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'dining.table_group.delete',
      summary: `Removed table group "${group.name}"`,
      meta: { groupId: id, sectionId: group.sectionId },
    });
    return this.listGamingSections(actor, group.section.categoryId);
  }

  async uploadDiningTableGroupImage(
    actor: JwtAccessPayload,
    groupId: string,
    file: ResourceImageUpload,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const group = await this.prisma.diningTableGroup.findFirst({
      where: { id: groupId, shopId },
      include: { section: { select: { categoryId: true } } },
    });
    if (!group) throw new NotFoundException('Table group not found.');
    assertResourceImageFile(file);
    const url = await this.media.replaceMediaPath(shopId, group.imageUrl, file);
    await this.prisma.diningTableGroup.update({
      where: { id: groupId },
      data: { imageUrl: url },
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'dining.table_group.image',
      summary: `Updated table group image for "${group.name}"`,
      meta: { groupId },
    });
    return this.listGamingSections(actor, group.section.categoryId);
  }

  private async syncShopFloorFromDiningSections(shopId: string) {
    const agg = await this.prisma.gamingSection.aggregate({
      where: {
        shopId,
        category: { type: 'DINING' },
      },
      _max: { floor: true },
    });
    const floorCount = Math.max(1, Math.min(10, agg._max.floor ?? 1));
    await this.prisma.shop.update({
      where: { id: shopId },
      data: { floorCount },
    });
  }

  private async syncTableGroupInventory(
    shopId: string,
    categoryId: string,
    tableGroupId: string,
    sectionId: string,
    targetTotal: number,
    capacity: number,
  ) {
    const resources = await this.prisma.resource.findMany({
      where: { shopId, tableGroupId },
      orderBy: [{ sortOrder: 'desc' }, { name: 'asc' }],
    });
    const current = resources.length;
    if (targetTotal === current) return;

    if (targetTotal > current) {
      await this.addUnitsInternal(
        shopId,
        categoryId,
        'DINING',
        targetTotal - current,
        'Table',
        sectionId,
        capacity,
        tableGroupId,
      );
      return;
    }

    const toRemove = resources.slice(0, current - targetTotal);
    const now = new Date();
    for (const unit of toRemove) {
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
          `Cannot remove ${unit.name} — it has an active booking.`,
        );
      }
    }
    await this.prisma.resource.deleteMany({
      where: { id: { in: toRemove.map((r) => r.id) } },
    });
  }

  private async syncSectionInventory(
    shopId: string,
    categoryId: string,
    type: ResourceType,
    sectionId: string,
    targetTotal: number,
    namePrefix: string,
    tableCapacity: number | null = null,
  ) {
    const resources = await this.prisma.resource.findMany({
      where: { shopId, sectionId },
      orderBy: [{ sortOrder: 'desc' }, { name: 'asc' }],
    });
    const current = resources.length;
    if (targetTotal === current) return;

    if (targetTotal > current) {
      const capacity =
        tableCapacity ?? (type === 'DINING' ? 4 : null);
      await this.addUnitsInternal(
        shopId,
        categoryId,
        type,
        targetTotal - current,
        namePrefix,
        sectionId,
        capacity,
      );
      return;
    }

    const toRemove = resources.slice(0, current - targetTotal);
    const now = new Date();
    for (const unit of toRemove) {
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
          `Cannot remove ${unit.name} — it has an active booking.`,
        );
      }
    }
    await this.prisma.resource.deleteMany({
      where: { id: { in: toRemove.map((r) => r.id) } },
    });
  }

  private async getCategory(actor: JwtAccessPayload, id: string) {
    const cat = await this.prisma.resourceCategory.findFirst({
      where: { id, shopId: actor.shopId! },
      include: {
        rates: { orderBy: { sortOrder: 'asc' } },
        gamingSections: { orderBy: { sortOrder: 'asc' } },
        resources: {
          include: { section: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!cat) throw new NotFoundException('Category not found');
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
      orderBy: [{ sortOrder: 'desc' }, { name: 'asc' }],
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
    sectionId?: string,
    capacity?: number | null,
    tableGroupId?: string,
  ) {
    const existing = await this.prisma.resource.count({
      where: {
        categoryId,
        ...(sectionId ? { sectionId } : {}),
        ...(tableGroupId && type !== 'DINING' ? { tableGroupId } : {}),
      },
    });
    const defaultRate = await this.prisma.resourceRate.findFirst({
      where: { categoryId },
      orderBy: { sortOrder: 'asc' },
    });
    const hourly =
      defaultRate?.durationMinutes && defaultRate.durationMinutes > 0
        ? (defaultRate.price / defaultRate.durationMinutes) * 60
        : (defaultRate?.price ?? 0);

    const rows = Array.from({ length: count }, (_, i) => {
      const n = existing + i + 1;
      const padded = String(n).padStart(2, '0');
      return {
        shopId,
        categoryId,
        sectionId: sectionId ?? null,
        tableGroupId: tableGroupId ?? null,
        type,
        name: `${namePrefix} ${padded}`,
        hourlyRate: hourly,
        sortOrder: n,
        ...(capacity != null && capacity > 0 ? { capacity } : {}),
      };
    });
    await this.prisma.resource.createMany({ data: rows });
  }

  private async ensureCategory(shopId: string, id: string) {
    const c = await this.prisma.resourceCategory.findFirst({
      where: { id, shopId },
    });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  private async ensureSection(shopId: string, id: string) {
    const section = await this.prisma.gamingSection.findFirst({
      where: { id, shopId },
    });
    if (!section) throw new NotFoundException('Gaming section not found');
    return section;
  }

  private async ensureResource(shopId: string, id: string) {
    const r = await this.prisma.resource.findFirst({ where: { id, shopId } });
    if (!r) throw new NotFoundException('Resource not found');
    return r;
  }
}
