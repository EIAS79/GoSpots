import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { MealPeriod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { presetForPeriod } from '../../common/meal-periods';
import { requireShopId, slugifyTag } from '../../common/tenant';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateMenuItemDto,
  CreateSectionDto,
  CreateTagDto,
  UpdateMenuItemDto,
  UpdateSectionDto,
} from './dto/menu.dto';
import {
  resetShopMenuStockForDay,
  setMenuItemStockBaseline,
} from '../../common/menu-stock-db.util';
import { venueDayKey } from '../../common/menu-stock.util';
import { loadShopVenueTimeContext } from '../../common/shop-venue-time.util';
import { serializeMoney, toPrismaDecimal } from '../../common/money.util';
import { assertMenuImageFile, type MenuImageUpload } from './menu-upload.util';
import { MediaService } from '../media/media.service';
import {
  sectionImageUrl,
  sectionImageUrlsByShop,
  setSectionImageUrl,
} from '../../common/menu-section-image.util';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  /** Defensive caps on staff `GET /menu` payload (response shape unchanged). */
  static readonly MENU_SECTION_TAKE = 200;
  static readonly MENU_TAG_TAKE = 200;
  static readonly MENU_ITEM_TAKE = 2000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? '';
    if (p !== '*' && !p.split(',').includes('menu.write')) {
      throw new ForbiddenException('Missing menu.write');
    }
  }

  async getFullMenu(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );
    const today = venueDayKey(resolvedTimeZone);
    const sectionTake = MenuService.MENU_SECTION_TAKE;
    const tagTake = MenuService.MENU_TAG_TAKE;
    const itemTake = MenuService.MENU_ITEM_TAKE;

    const [sections, tags, sectionImages] = await Promise.all([
      this.prisma.menuSection.findMany({
        where: { shopId },
        orderBy: { sortOrder: 'asc' },
        take: sectionTake,
      }),
      this.prisma.shopTag.findMany({
        where: { shopId },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
        take: tagTake,
      }),
      sectionImageUrlsByShop(this.prisma, shopId),
    ]);

    if (sections.length === sectionTake) {
      this.logger.warn(
        `Menu sections hit take cap (${sectionTake}) for shop=${shopId}; POS menu may omit sections beyond sortOrder.`,
      );
    }
    if (tags.length === tagTake) {
      this.logger.warn(
        `Menu tags hit take cap (${tagTake}) for shop=${shopId}; POS menu may omit tags beyond type/sortOrder.`,
      );
    }

    await resetShopMenuStockForDay(this.prisma, shopId, today);
    const itemsAfterReset = await this.prisma.menuItem.findMany({
      where: { shopId },
      include: { tags: { include: { tag: true } } },
      orderBy: { name: 'asc' },
      take: itemTake,
    });

    if (itemsAfterReset.length === itemTake) {
      this.logger.warn(
        `Menu items hit take cap (${itemTake}) for shop=${shopId}; POS menu may omit items beyond name sort.`,
      );
    }
    return {
      sections: sections.map((s) => ({
        ...s,
        imageUrl: sectionImages.get(s.id) ?? null,
      })),
      tags,
      items: itemsAfterReset.map((i) => ({
        ...i,
        price: serializeMoney(i.price),
        stockDaily: (i as { stockDaily?: number }).stockDaily ?? i.stock,
        stockResetOn:
          (i as { stockResetOn?: string | null }).stockResetOn ?? null,
        tagIds: i.tags.map((t) => t.tagId),
        tags: i.tags.map((t) => t.tag),
      })),
    };
  }

  private sectionTimingFromDto(dto: {
    mealPeriod?: MealPeriod | null;
    availableFrom?: string | null;
    availableTo?: string | null;
    availableDays?: string;
  }) {
    const preset = dto.mealPeriod ? presetForPeriod(dto.mealPeriod) : null;
    return {
      mealPeriod: dto.mealPeriod ?? undefined,
      availableFrom: dto.availableFrom ?? preset?.from ?? undefined,
      availableTo: dto.availableTo ?? preset?.to ?? undefined,
      availableDays: dto.availableDays ?? '0,1,2,3,4,5,6',
    };
  }

  async createSection(actor: JwtAccessPayload, dto: CreateSectionDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    await assertShopFeature(this.prisma, shopId, 'menu');
    const timing = this.sectionTimingFromDto(dto);
    const section = await this.prisma.menuSection.create({
      data: {
        shopId: actor.shopId!,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        ...timing,
      },
    });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.section.create',
      summary: `Created menu section "${section.name}"`,
      meta: { sectionId: section.id },
    });
    return { ...section, imageUrl: null };
  }

  async updateSection(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateSectionDto,
  ) {
    this.assertWrite(actor);
    const existing = await this.ensureSection(actor.shopId!, id);
    const timing =
      dto.mealPeriod !== undefined ||
      dto.availableFrom !== undefined ||
      dto.availableTo !== undefined ||
      dto.availableDays !== undefined
        ? this.sectionTimingFromDto({
            mealPeriod:
              dto.mealPeriod === undefined
                ? existing.mealPeriod
                : dto.mealPeriod,
            availableFrom:
              dto.availableFrom === undefined
                ? existing.availableFrom
                : dto.availableFrom,
            availableTo:
              dto.availableTo === undefined
                ? existing.availableTo
                : dto.availableTo,
            availableDays: dto.availableDays ?? existing.availableDays,
          })
        : {};
    if (dto.imageUrl === null) {
      const oldUrl = await sectionImageUrl(this.prisma, actor.shopId!, id);
      if (oldUrl) await this.media.deleteByMediaPath(actor.shopId!, oldUrl);
      await setSectionImageUrl(this.prisma, actor.shopId!, id, null);
    }
    const section = await this.prisma.menuSection.update({
      where: { id, shopId: actor.shopId! },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...timing,
      },
    });
    const imageUrl =
      dto.imageUrl === null
        ? null
        : await sectionImageUrl(this.prisma, actor.shopId!, id);
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.section.update',
      summary: `Updated menu section "${section.name}"`,
      meta: { sectionId: id, before: existing.name, after: section.name },
    });
    return { ...section, imageUrl };
  }

  async uploadSectionImage(
    actor: JwtAccessPayload,
    id: string,
    file: MenuImageUpload,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const section = await this.ensureSection(shopId, id);
    assertMenuImageFile(file);
    const oldUrl = await sectionImageUrl(this.prisma, shopId, id);
    const url = await this.media.replaceMediaPath(shopId, oldUrl, file);
    await setSectionImageUrl(this.prisma, shopId, id, url);
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.section.image',
      summary: `Updated menu section image "${section.name}"`,
      meta: { sectionId: id },
    });
    return { ...section, imageUrl: url };
  }

  async deleteSection(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const existing = await this.ensureSection(actor.shopId!, id);
    const oldUrl = await sectionImageUrl(this.prisma, actor.shopId!, id);
    await this.media.deleteByMediaPath(actor.shopId!, oldUrl);
    await this.prisma.menuSection.delete({ where: { id, shopId: actor.shopId! } });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.section.delete',
      summary: `Deleted menu section "${existing.name}"`,
      meta: { sectionId: id },
    });
    return { ok: true };
  }

  async createTag(actor: JwtAccessPayload, dto: CreateTagDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    let slug = slugifyTag(dto.name);
    const clash = await this.prisma.shopTag.findUnique({
      where: { shopId_slug: { shopId, slug } },
    });
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const tag = await this.prisma.shopTag.create({
      data: {
        shopId,
        name: dto.name,
        slug,
        type: dto.type,
        color: dto.color,
      },
    });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.tag.create',
      summary: `Created menu tag "${tag.name}"`,
      meta: { tagId: tag.id },
    });
    return tag;
  }

  async deleteTag(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const existing = await this.ensureTag(actor.shopId!, id);
    await this.prisma.shopTag.delete({ where: { id, shopId: actor.shopId! } });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.tag.delete',
      summary: `Deleted menu tag "${existing.name}"`,
      meta: { tagId: id },
    });
    return { ok: true };
  }

  async createItem(actor: JwtAccessPayload, dto: CreateMenuItemDto) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    await assertShopFeature(this.prisma, shopId, 'menu');
    if (dto.sectionId) await this.ensureSection(shopId, dto.sectionId);
    const item = await this.prisma.menuItem.create({
      data: {
        shopId,
        sectionId: dto.sectionId,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        imageUrl2: dto.imageUrl2,
        price: toPrismaDecimal(dto.price),
        stock: dto.stock ?? 0,
        trackStock: dto.trackStock ?? false,
        isAvailable: dto.isAvailable ?? true,
        useSectionTiming: dto.useSectionTiming ?? true,
        availableFrom: dto.availableFrom,
        availableTo: dto.availableTo,
        availableDays: dto.availableDays ?? '0,1,2,3,4,5,6',
      },
    });
    if (dto.tagIds?.length) {
      await this.syncTags(item.id, shopId, dto.tagIds);
    }
    if (dto.trackStock ?? false) {
      const { resolvedTimeZone } = await loadShopVenueTimeContext(
        this.prisma,
        shopId,
      );
      await setMenuItemStockBaseline(
        this.prisma,
        item.id,
        dto.stock ?? 0,
        venueDayKey(resolvedTimeZone),
      );
    }
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.item.create',
      summary: `Added menu item "${item.name}" (${item.price})`,
      meta: { menuItemId: item.id, price: item.price },
    });
    return this.getItem(actor, item.id);
  }

  async updateItem(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateMenuItemDto,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const before = await this.ensureItem(shopId, id);
    if (dto.sectionId) await this.ensureSection(shopId, dto.sectionId);
    await this.prisma.menuItem.update({
      where: { id, shopId },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.sectionId !== undefined && { sectionId: dto.sectionId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.imageUrl2 !== undefined && { imageUrl2: dto.imageUrl2 }),
        ...(dto.price != null && { price: toPrismaDecimal(dto.price) }),
        ...(dto.stock != null && { stock: dto.stock }),
        ...(dto.trackStock != null && { trackStock: dto.trackStock }),
        ...(dto.isAvailable != null && { isAvailable: dto.isAvailable }),
        ...(dto.useSectionTiming != null && {
          useSectionTiming: dto.useSectionTiming,
        }),
        ...(dto.availableFrom !== undefined && {
          availableFrom: dto.availableFrom,
        }),
        ...(dto.availableTo !== undefined && { availableTo: dto.availableTo }),
        ...(dto.availableDays != null && { availableDays: dto.availableDays }),
      },
    });
    if (dto.tagIds) await this.syncTags(id, shopId, dto.tagIds);
    if (dto.stock != null) {
      const { resolvedTimeZone } = await loadShopVenueTimeContext(
        this.prisma,
        shopId,
      );
      await setMenuItemStockBaseline(
        this.prisma,
        id,
        dto.stock,
        venueDayKey(resolvedTimeZone),
      );
    }
    const after = await this.getItem(actor, id);
    if (
      after.trackStock &&
      after.stock <= 0 &&
      before.stock > 0
    ) {
      await this.notifications.recordOperationsEvent(shopId, {
        title: 'Menu item out of stock',
        body: `"${after.name}" has 0 units left`,
        href: '/menu',
        dedupeKey: `menu-stock:${after.id}`,
      });
    }
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.item.update',
      summary: `Updated menu item "${after.name}"`,
      meta: {
        menuItemId: id,
        before: { name: before.name, price: before.price },
        changes: dto,
      },
    });
    return after;
  }

  async uploadItemImage(
    actor: JwtAccessPayload,
    id: string,
    slot: '1' | '2',
    file: MenuImageUpload,
  ) {
    this.assertWrite(actor);
    const shopId = actor.shopId!;
    const item = await this.ensureItem(shopId, id);
    assertMenuImageFile(file);
    const oldUrl = slot === '1' ? item.imageUrl : item.imageUrl2;
    const url = await this.media.replaceMediaPath(shopId, oldUrl, file);
    const data = slot === '1' ? { imageUrl: url } : { imageUrl2: url };
    await this.prisma.menuItem.update({ where: { id, shopId }, data });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.item.image',
      summary: `Updated menu item image (${slot})`,
      meta: { menuItemId: id, slot },
    });
    return this.getItem(actor, id);
  }

  async deleteItem(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const existing = await this.ensureItem(actor.shopId!, id);
    await this.media.deleteByMediaPath(actor.shopId!, existing.imageUrl);
    await this.media.deleteByMediaPath(actor.shopId!, existing.imageUrl2);
    await this.prisma.menuItem.delete({ where: { id, shopId: actor.shopId! } });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.item.delete',
      summary: `Deleted menu item "${existing.name}"`,
      meta: { menuItemId: id },
    });
    return { ok: true };
  }

  private async getItem(actor: JwtAccessPayload, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, shopId: actor.shopId! },
      include: { tags: { include: { tag: true } } },
    });
    if (!item) throw new NotFoundException();
    return {
      ...item,
      price: serializeMoney(item.price),
      tagIds: item.tags.map((t) => t.tagId),
      tags: item.tags.map((t) => t.tag),
    };
  }

  private async syncTags(itemId: string, shopId: string, tagIds: string[]) {
    const valid = await this.prisma.shopTag.findMany({
      where: { shopId, id: { in: tagIds } },
      select: { id: true },
    });
    await this.prisma.menuItemTag.deleteMany({
      where: { menuItemId: itemId, menuItem: { shopId } },
    });
    if (valid.length) {
      await this.prisma.menuItemTag.createMany({
        data: valid.map((t) => ({ menuItemId: itemId, tagId: t.id })),
      });
    }
  }

  private async ensureSection(shopId: string, id: string) {
    const s = await this.prisma.menuSection.findFirst({
      where: { id, shopId },
    });
    if (!s) throw new NotFoundException('Section not found');
    return s;
  }

  private async ensureTag(shopId: string, id: string) {
    const t = await this.prisma.shopTag.findFirst({ where: { id, shopId } });
    if (!t) throw new NotFoundException('Tag not found');
    return t;
  }

  private async ensureItem(shopId: string, id: string) {
    const i = await this.prisma.menuItem.findFirst({ where: { id, shopId } });
    if (!i) throw new NotFoundException('Item not found');
    return i;
  }
}
