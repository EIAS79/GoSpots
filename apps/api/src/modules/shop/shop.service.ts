import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TagType } from "@prisma/client";
import {
  isSupportedCurrency,
  isSupportedLocale,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from "../../common/locale-currency";
import {
  slugifyVenueCategory,
  venueCategoryPreset,
  VENUE_CATEGORY_PRESETS,
} from "../../common/venue-categories";
import { SyncVenueCategoriesDto } from "./dto/shop-settings.dto";
import { requireShopId } from "../../common/tenant";
import type { JwtAccessPayload } from "../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrencyRatesService } from "./currency-rates.service";
import { ConvertCurrencyDto, UpdateShopSettingsDto } from "./dto/shop-settings.dto";

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rates: CurrencyRatesService,
  ) {}

  private assertOwnerOrManager(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole !== "OWNER" && actor.shopRole !== "MANAGER") {
      throw new ForbiddenException("Only venue admins can change settings.");
    }
  }

  private shopProfileSelect() {
    return {
      id: true,
      name: true,
      displayName: true,
      slug: true,
      description: true,
      address: true,
      city: true,
      country: true,
      phone: true,
      email: true,
      coverImage: true,
      locale: true,
      currency: true,
      isPublished: true,
      floorCount: true,
    } as const;
  }

  async getSettings(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: this.shopProfileSelect(),
    });
    if (!shop) throw new NotFoundException("Venue not found.");
    const venueCategories = await this.prisma.shopTag.findMany({
      where: { shopId, type: TagType.VENUE_CATEGORY },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, color: true },
    });
    return {
      shop,
      locales: SUPPORTED_LOCALES,
      currencies: SUPPORTED_CURRENCIES,
      venueCategoryPresets: VENUE_CATEGORY_PRESETS,
      venueCategories,
    };
  }

  async updateSettings(actor: JwtAccessPayload, dto: UpdateShopSettingsDto) {
    this.assertOwnerOrManager(actor);
    const shopId = requireShopId(actor);

    const before = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: this.shopProfileSelect(),
    });
    if (!before) throw new NotFoundException();

    if (dto.locale != null && !isSupportedLocale(dto.locale)) {
      throw new BadRequestException("Unsupported language.");
    }
    if (dto.currency != null && !isSupportedCurrency(dto.currency)) {
      throw new BadRequestException("Unsupported currency.");
    }
    if (dto.name != null && !dto.name.trim()) {
      throw new BadRequestException("Venue name is required.");
    }
    if (dto.floorCount != null && (dto.floorCount < 1 || dto.floorCount > 10)) {
      throw new BadRequestException("Floor count must be between 1 and 10.");
    }

    if (dto.floorCount != null) {
      await this.prisma.seatingTableGroup.updateMany({
        where: { shopId, floor: { gt: dto.floorCount } },
        data: { floor: dto.floorCount },
      });
    }

    const shop = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        ...(dto.locale != null && { locale: dto.locale }),
        ...(dto.currency != null && { currency: dto.currency.toUpperCase() }),
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.displayName !== undefined && {
          displayName: dto.displayName?.trim() || null,
        }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.address !== undefined && {
          address: dto.address?.trim() || null,
        }),
        ...(dto.city !== undefined && { city: dto.city?.trim() || null }),
        ...(dto.country !== undefined && {
          country: dto.country?.trim() || null,
        }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        ...(dto.floorCount != null && { floorCount: dto.floorCount }),
      },
      select: this.shopProfileSelect(),
    });

    const changes: string[] = [];
    if (dto.locale != null && dto.locale !== before.locale) {
      changes.push(`language → ${dto.locale}`);
    }
    if (dto.currency != null && dto.currency.toUpperCase() !== before.currency) {
      changes.push(`currency → ${dto.currency.toUpperCase()}`);
    }
    if (dto.name != null && dto.name.trim() !== before.name) {
      changes.push(`name → ${shop.name}`);
    }
    if (
      dto.displayName !== undefined &&
      (dto.displayName?.trim() || null) !== (before.displayName?.trim() || null)
    ) {
      changes.push(`display name updated`);
    }
    if (dto.isPublished !== undefined && dto.isPublished !== before.isPublished) {
      changes.push(dto.isPublished ? "published" : "unpublished");
    }
    if (
      dto.address !== undefined ||
      dto.city !== undefined ||
      dto.country !== undefined
    ) {
      const locChanged =
        (dto.address !== undefined &&
          (dto.address?.trim() || null) !== (before.address?.trim() || null)) ||
        (dto.city !== undefined &&
          (dto.city?.trim() || null) !== (before.city?.trim() || null)) ||
        (dto.country !== undefined &&
          (dto.country?.trim() || null) !== (before.country?.trim() || null));
      if (locChanged) changes.push("location updated");
    }
    if (changes.length) {
      await this.audit.record(actor, {
        section: "venue",
        action: "venue.settings.update",
        summary: `Updated venue: ${changes.join(", ")}`,
        meta: { before, after: shop },
      });
    }

    return this.getSettings(actor);
  }

  async syncVenueCategories(actor: JwtAccessPayload, dto: SyncVenueCategoriesDto) {
    this.assertOwnerOrManager(actor);
    const shopId = requireShopId(actor);

    const desired: { slug: string; name: string; color: string | null }[] = [];
    for (const slug of dto.presetSlugs ?? []) {
      const preset = venueCategoryPreset(slug);
      if (!preset) continue;
      desired.push({ slug: preset.slug, name: preset.name, color: preset.color });
    }
    for (const c of dto.custom ?? []) {
      const name = c.name.trim();
      if (!name) continue;
      let slug = slugifyVenueCategory(name);
      if (!slug) continue;
      if (desired.some((d) => d.slug === slug)) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }
      desired.push({ slug, name, color: c.color?.trim() || null });
    }

    const existing = await this.prisma.shopTag.findMany({
      where: { shopId, type: TagType.VENUE_CATEGORY },
    });
    const desiredSlugs = new Set(desired.map((d) => d.slug));

    for (const tag of existing) {
      if (!desiredSlugs.has(tag.slug)) {
        await this.prisma.shopTag.delete({ where: { id: tag.id } });
      }
    }

    let sort = 0;
    for (const d of desired) {
      const hit = existing.find((t) => t.slug === d.slug);
      if (hit) {
        await this.prisma.shopTag.update({
          where: { id: hit.id },
          data: {
            name: d.name,
            color: d.color,
            sortOrder: sort++,
            type: TagType.VENUE_CATEGORY,
          },
        });
      } else {
        await this.prisma.shopTag.create({
          data: {
            shopId,
            name: d.name,
            slug: d.slug,
            color: d.color,
            type: TagType.VENUE_CATEGORY,
            sortOrder: sort++,
          },
        });
      }
    }

    await this.audit.record(actor, {
      section: "venue",
      action: "venue.categories.sync",
      summary: `Venue categories: ${desired.map((d) => d.name).join(", ") || "none"}`,
      meta: { slugs: [...desiredSlugs] },
    });

    return this.getSettings(actor);
  }

  async convertCurrency(actor: JwtAccessPayload, dto: ConvertCurrencyDto) {
    requireShopId(actor);
    const targets =
      dto.toCurrencies?.length ?
        dto.toCurrencies
      : dto.to ?
        [dto.to]
      : [];
    if (targets.length === 0) {
      const shop = await this.prisma.shop.findUnique({
        where: { id: actor.shopId },
        select: { currency: true },
      });
      if (shop?.currency) targets.push(shop.currency);
    }
    const result = await this.rates.convert(dto.amount, dto.from, targets);
    await this.audit.record(actor, {
      section: "venue",
      action: "venue.currency.convert",
      summary: `Converted ${dto.amount} ${result.from} → ${result.conversions.map((c) => c.currency).join(", ")}`,
      meta: { ...dto, result },
    });
    return result;
  }

  listCurrencies() {
    return this.rates.listCurrencies();
  }

  /** Published venues for marketing / player browse */
  async listPublicVenues(query?: {
    q?: string;
    city?: string;
    country?: string;
    categories?: string[];
  }) {
    const q = query?.q?.trim();
    const city = query?.city?.trim();
    const country = query?.country?.trim();
    const categorySlugs = (query?.categories ?? []).filter(Boolean);

    const and: Record<string, unknown>[] = [{ isPublished: true }];
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { country: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (city) {
      and.push({ city: { contains: city, mode: "insensitive" } });
    }
    if (country) {
      and.push({ country: { contains: country, mode: "insensitive" } });
    }
    if (categorySlugs.length) {
      and.push({
        tags: {
          some: {
            type: TagType.VENUE_CATEGORY,
            slug: { in: categorySlugs },
          },
        },
      });
    }

    return this.prisma.shop.findMany({
      where: { AND: and },
      select: {
        id: true,
        slug: true,
        name: true,
        displayName: true,
        city: true,
        country: true,
        description: true,
        coverImage: true,
        locale: true,
        currency: true,
        tags: {
          where: { type: TagType.VENUE_CATEGORY },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, slug: true, color: true },
        },
      },
      orderBy: [{ country: "asc" }, { city: "asc" }, { name: "asc" }],
    });
  }

  /** Public venue profile + customer gallery */
  async getPublicVenue(slug: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: {
        id: true,
        slug: true,
        name: true,
        displayName: true,
        description: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        coverImage: true,
        locale: true,
        currency: true,
        galleryItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            imageUrl: true,
            caption: true,
            sortOrder: true,
          },
        },
        tags: {
          where: { type: TagType.VENUE_CATEGORY },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, slug: true, color: true },
        },
      },
    });
    if (!shop) throw new NotFoundException("Venue not found.");
    return shop;
  }
}
