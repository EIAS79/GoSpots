import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TagType } from '@prisma/client';
import { FEATURED_GAME_TYPES, DINING_TYPES } from '../../common/booking-unit-kind';
import {
  isSupportedCurrency,
  isSupportedLocale,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from '../../common/locale-currency';
import {
  slugifyVenueCategory,
  venueCategoryPreset,
  VENUE_CATEGORY_PRESETS,
} from '../../common/venue-categories';
import { SyncVenueCategoriesDto } from './dto/shop-settings.dto';
import { sectionImageUrlsByShop } from '../../common/menu-section-image.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { resolveEnabledModules } from '../../common/subscription-tier';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyRatesService } from './currency-rates.service';
import {
  ConvertCurrencyDto,
  UpdateShopSettingsDto,
} from './dto/shop-settings.dto';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly rates: CurrencyRatesService,
  ) {}

  private assertVenueSettingsWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE)) return;
    throw new ForbiddenException('Missing shop.manage permission.');
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
      advertiseOnVenuesPage: true,
      reviewsMode: true,
      floorCount: true,
    } as const;
  }

  async getSettings(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: this.shopProfileSelect(),
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    const venueCategories = await this.prisma.shopTag.findMany({
      where: { shopId, type: TagType.VENUE_CATEGORY },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
    this.assertVenueSettingsWrite(actor);
    const shopId = requireShopId(actor);

    const before = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: this.shopProfileSelect(),
    });
    if (!before) throw new NotFoundException();

    if (dto.locale != null && !isSupportedLocale(dto.locale)) {
      throw new BadRequestException('Unsupported language.');
    }
    if (dto.currency != null && !isSupportedCurrency(dto.currency)) {
      throw new BadRequestException('Unsupported currency.');
    }
    if (dto.name != null && !dto.name.trim()) {
      throw new BadRequestException('Venue name is required.');
    }
    if (dto.floorCount != null && (dto.floorCount < 1 || dto.floorCount > 10)) {
      throw new BadRequestException('Floor count must be between 1 and 10.');
    }

    if (dto.isPublished === true || dto.advertiseOnVenuesPage === true) {
      const shopSub = await this.prisma.shop.findUnique({
        where: { id: shopId },
        select: {
          subscription: {
            select: {
              tier: true,
              status: true,
              trialEndsAt: true,
              packId: true,
              addOns: true,
            },
          },
        },
      });
      const modules = resolveEnabledModules(shopSub?.subscription ?? null);
      if (!modules.has('marketing')) {
        throw new BadRequestException(
          'Unlock the Venue page & discovery add-on to publish your public venue page or list on /venues.',
        );
      }
    }

    if (dto.floorCount != null) {
      await this.prisma.seatingTableGroup.updateMany({
        where: { shopId, floor: { gt: dto.floorCount } },
        data: { floor: dto.floorCount },
      });
    }

    const nextCurrency =
      dto.currency != null ? dto.currency.toUpperCase() : before.currency;
    const currencyChanged =
      dto.currency != null && nextCurrency !== before.currency;

    let currencyConversion: {
      from: string;
      to: string;
      rate: number;
      ratesAt: string;
      menuItems: number;
      resourceRates: number;
      resources: number;
      offerings: number;
    } | null = null;

    if (currencyChanged) {
      currencyConversion = await this.repriceCatalogToCurrency(
        shopId,
        before.currency,
        nextCurrency,
      );
    }

    const shop = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        ...(dto.locale != null && { locale: dto.locale }),
        ...(dto.currency != null && { currency: nextCurrency }),
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
        ...(dto.advertiseOnVenuesPage !== undefined && {
          advertiseOnVenuesPage: dto.advertiseOnVenuesPage,
        }),
        ...(dto.reviewsMode !== undefined && { reviewsMode: dto.reviewsMode }),
        ...(dto.floorCount != null && { floorCount: dto.floorCount }),
      },
      select: this.shopProfileSelect(),
    });

    const changes: string[] = [];
    if (dto.locale != null && dto.locale !== before.locale) {
      changes.push(`language → ${dto.locale}`);
    }
    if (currencyChanged) {
      changes.push(
        `currency → ${nextCurrency}` +
          (currencyConversion
            ? ` (catalog ×${currencyConversion.rate.toFixed(6)})`
            : ''),
      );
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
    if (
      dto.description !== undefined &&
      (dto.description?.trim() || null) !== (before.description?.trim() || null)
    ) {
      changes.push('description updated');
    }
    if (
      dto.phone !== undefined &&
      (dto.phone?.trim() || null) !== (before.phone?.trim() || null)
    ) {
      changes.push('phone updated');
    }
    if (
      dto.email !== undefined &&
      (dto.email?.trim() || null) !== (before.email?.trim() || null)
    ) {
      changes.push('email updated');
    }
    if (dto.floorCount != null && dto.floorCount !== before.floorCount) {
      changes.push(`floors → ${dto.floorCount}`);
    }
    const publishChanged =
      dto.isPublished !== undefined && dto.isPublished !== before.isPublished;
    if (publishChanged) {
      changes.push(dto.isPublished ? 'published' : 'unpublished');
    }
    if (
      dto.advertiseOnVenuesPage !== undefined &&
      dto.advertiseOnVenuesPage !== before.advertiseOnVenuesPage
    ) {
      changes.push(
        dto.advertiseOnVenuesPage
          ? 'directory ads on'
          : 'directory ads off',
      );
    }
    if (
      dto.reviewsMode !== undefined &&
      dto.reviewsMode !== before.reviewsMode
    ) {
      changes.push(`reviews → ${dto.reviewsMode.toLowerCase()}`);
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
      if (locChanged) changes.push('location updated');
    }
    if (changes.length) {
      await this.audit.record(actor, {
        section: 'venue',
        action: 'venue.settings.update',
        summary: `Updated venue: ${changes.join(', ')}`,
        meta: { before, after: shop },
      });
    }

    if (publishChanged) {
      await this.notifications.recordTeamEvent(shopId, {
        title: shop.isPublished
          ? 'Venue published on browse'
          : 'Venue hidden from browse',
        body: shop.isPublished
          ? `${shop.name} is now visible on the public venues page.`
          : `${shop.name} is no longer listed publicly until you publish again.`,
        href: '/settings',
        dedupeKey: `publish:${shop.isPublished ? 'on' : 'off'}:${Date.now()}`,
      });
    }

    return {
      ...(await this.getSettings(actor)),
      currencyConversion,
    };
  }

  /**
   * Rewrite live catalog amounts into the new shop currency using a fresh FX rate.
   * Historical orders/transactions keep their original numbers (past sales).
   */
  private async repriceCatalogToCurrency(
    shopId: string,
    from: string,
    to: string,
  ) {
    const { rate, ratesAt } = await this.rates.getRate(from, to, {
      forceRefresh: true,
    });

    const menuItems = await this.prisma.menuItem.findMany({
      where: { shopId },
      select: { id: true, price: true },
    });
    for (const item of menuItems) {
      await this.prisma.menuItem.update({
        where: { id: item.id },
        data: { price: this.rates.convertAmount(item.price, rate) },
      });
    }

    const categories = await this.prisma.resourceCategory.findMany({
      where: { shopId },
      select: {
        id: true,
        offeringConfig: true,
        rates: { select: { id: true, price: true } },
      },
    });

    let resourceRates = 0;
    let offerings = 0;
    for (const cat of categories) {
      for (const r of cat.rates) {
        await this.prisma.resourceRate.update({
          where: { id: r.id },
          data: { price: this.rates.convertAmount(r.price, rate) },
        });
        resourceRates += 1;
      }
      const nextConfig = scaleOfferingConfigPrices(cat.offeringConfig, (n) =>
        this.rates.convertAmount(n, rate),
      );
      if (nextConfig !== cat.offeringConfig) {
        await this.prisma.resourceCategory.update({
          where: { id: cat.id },
          data: { offeringConfig: nextConfig as object },
        });
        offerings += 1;
      }
    }

    const resources = await this.prisma.resource.findMany({
      where: { shopId },
      select: { id: true, hourlyRate: true },
    });
    for (const res of resources) {
      if (res.hourlyRate === 0) continue;
      await this.prisma.resource.update({
        where: { id: res.id },
        data: { hourlyRate: this.rates.convertAmount(res.hourlyRate, rate) },
      });
    }

    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      ratesAt,
      menuItems: menuItems.length,
      resourceRates,
      resources: resources.filter((r) => r.hourlyRate !== 0).length,
      offerings,
    };
  }

  async syncVenueCategories(
    actor: JwtAccessPayload,
    dto: SyncVenueCategoriesDto,
  ) {
    this.assertVenueSettingsWrite(actor);
    const shopId = requireShopId(actor);

    const desired: { slug: string; name: string; color: string | null }[] = [];
    for (const slug of dto.presetSlugs ?? []) {
      const preset = venueCategoryPreset(slug);
      if (!preset) continue;
      desired.push({
        slug: preset.slug,
        name: preset.name,
        color: preset.color,
      });
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
      section: 'venue',
      action: 'venue.categories.sync',
      summary: `Venue categories: ${desired.map((d) => d.name).join(', ') || 'none'}`,
      meta: { slugs: [...desiredSlugs] },
    });

    return this.getSettings(actor);
  }

  async convertCurrency(actor: JwtAccessPayload, dto: ConvertCurrencyDto) {
    requireShopId(actor);
    const targets = dto.toCurrencies?.length
      ? dto.toCurrencies
      : dto.to
        ? [dto.to]
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
      section: 'venue',
      action: 'venue.currency.convert',
      summary: `Converted ${dto.amount} ${result.from} → ${result.conversions.map((c) => c.currency).join(', ')}`,
      meta: { ...dto, result },
    });
    return result;
  }

  /** Rate for UI: 1 `from` = `rate` units of shop currency (or `to`). */
  async getDisplayRate(
    actor: JwtAccessPayload,
    from = 'EUR',
    to?: string,
  ) {
    const shopId = requireShopId(actor);
    let target = to?.toUpperCase();
    if (!target) {
      const shop = await this.prisma.shop.findUnique({
        where: { id: shopId },
        select: { currency: true },
      });
      target = shop?.currency ?? 'EUR';
    }
    const { rate, ratesAt } = await this.rates.getRate(from, target, {
      forceRefresh: false,
    });
    return { from: from.toUpperCase(), to: target, rate, ratesAt };
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

    const and: Record<string, unknown>[] = [
      { isPublished: true },
      { advertiseOnVenuesPage: true },
    ];
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (city) {
      and.push({ city: { contains: city, mode: 'insensitive' } });
    }
    if (country) {
      and.push({ country: { contains: country, mode: 'insensitive' } });
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

    const where = { AND: and };
    const select = {
      id: true,
      slug: true,
      name: true,
      displayName: true,
      address: true,
      city: true,
      country: true,
      description: true,
      coverImage: true,
      locale: true,
      currency: true,
      tags: {
        where: { type: TagType.VENUE_CATEGORY },
        orderBy: { sortOrder: 'asc' as const },
        select: { id: true, name: true, slug: true, color: true },
      },
      openingHours: {
        orderBy: { weekday: 'asc' as const },
        select: {
          weekday: true,
          opensAt: true,
          closesAt: true,
          isClosed: true,
        },
      },
      _count: {
        select: {
          resourceCategories: true,
        },
      },
    };

    const [items, total, facetRows, todayExceptions] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        select,
        orderBy: [{ country: 'asc' }, { city: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.shop.count({ where }),
      this.prisma.shop.findMany({
        where: { isPublished: true, advertiseOnVenuesPage: true },
        select: { city: true, country: true },
      }),
      this.prisma.scheduleException.findMany({
        where: { date: new Date().toISOString().slice(0, 10) },
        select: {
          shopId: true,
          id: true,
          date: true,
          label: true,
          isClosed: true,
          opensAt: true,
          closesAt: true,
        },
      }),
    ]);

    const exceptionsByShop = new Map<string, typeof todayExceptions>();
    for (const ex of todayExceptions) {
      const list = exceptionsByShop.get(ex.shopId) ?? [];
      list.push(ex);
      exceptionsByShop.set(ex.shopId, list);
    }

    const countries = [
      ...new Set(
        facetRows.map((r) => r.country?.trim()).filter((c): c is string => !!c),
      ),
    ].sort();
    const cities = [
      ...new Set(
        facetRows.map((r) => r.city?.trim()).filter((c): c is string => !!c),
      ),
    ].sort();

    return {
      items: items.map(({ _count, id, ...row }) => {
        const raw = exceptionsByShop.get(id) ?? [];
        const scheduleExceptions = raw.map(({ shopId: _s, ...ex }) => ex);
        return {
          ...row,
          id,
          gameOfferingCount: _count.resourceCategories,
          scheduleExceptions,
        };
      }),
      total,
      facets: { countries, cities },
    };
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
        reviewsMode: true,
        galleryItems: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            imageUrl: true,
            caption: true,
            sortOrder: true,
          },
        },
        tags: {
          where: { type: TagType.VENUE_CATEGORY },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, slug: true, color: true },
        },
        openingHours: {
          orderBy: { weekday: 'asc' },
          select: {
            weekday: true,
            opensAt: true,
            closesAt: true,
            isClosed: true,
          },
        },
        subscription: {
          select: {
            tier: true,
            status: true,
            trialEndsAt: true,
            packId: true,
            addOns: true,
          },
        },
      },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    void this.prisma.analyticsEvent
      .create({
        data: {
          shopId: shop.id,
          type: 'VENUE_VIEW',
        },
      })
      .catch(() => undefined);

    const modules = resolveEnabledModules(shop.subscription);
    const hasGuestChat = modules.has('messaging');
    const { subscription: _subscription, ...shopPublic } = shop;

    const today = new Date().toISOString().slice(0, 10);

    const [
      gamingOfferings,
      diningOfferings,
      scheduleExceptions,
      menuSections,
      menuItems,
      sectionImages,
      seatingCount,
    ] = await Promise.all([
      this.prisma.resourceCategory.findMany({
        where: {
          shopId: shop.id,
          type: { in: FEATURED_GAME_TYPES },
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          type: true,
          name: true,
          description: true,
          imageUrl: true,
          bookingMode: true,
          playstationGames: true,
          offeringConfig: true,
          slotMinutes: true,
          rates: {
            orderBy: { sortOrder: 'asc' },
            select: {
              label: true,
              price: true,
              durationMinutes: true,
            },
          },
          _count: { select: { resources: true } },
        },
      }),
      this.prisma.resourceCategory.findMany({
        where: {
          shopId: shop.id,
          type: { in: DINING_TYPES },
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          type: true,
          name: true,
          description: true,
          imageUrl: true,
          bookingMode: true,
          playstationGames: true,
          offeringConfig: true,
          slotMinutes: true,
          rates: {
            orderBy: { sortOrder: 'asc' },
            select: {
              label: true,
              price: true,
              durationMinutes: true,
            },
          },
          _count: { select: { resources: true } },
        },
      }),
      this.prisma.scheduleException.findMany({
        where: { shopId: shop.id, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 12,
        select: {
          id: true,
          date: true,
          label: true,
          isClosed: true,
          opensAt: true,
          closesAt: true,
        },
      }),
      this.prisma.menuSection.findMany({
        where: { shopId: shop.id },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          mealPeriod: true,
          availableFrom: true,
          availableTo: true,
          availableDays: true,
        },
      }),
      this.prisma.menuItem.findMany({
        where: { shopId: shop.id, isAvailable: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          sectionId: true,
          name: true,
          description: true,
          imageUrl: true,
          imageUrl2: true,
          price: true,
          trackStock: true,
          stock: true,
          useSectionTiming: true,
          availableFrom: true,
          availableTo: true,
          availableDays: true,
          tags: {
            select: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  type: true,
                  color: true,
                },
              },
            },
          },
        },
      }),
      sectionImageUrlsByShop(this.prisma, shop.id),
      this.prisma.seatingTableGroup.count({
        where: {
          shopId: shop.id,
          isCustom: false,
          totalCount: { gt: 0 },
        },
      }),
    ]);

    const menu =
      menuItems.length > 0
        ? {
            sections: menuSections.map((s) => ({
              ...s,
              imageUrl: sectionImages.get(s.id) ?? null,
            })),
            items: menuItems.map((i) => ({
              id: i.id,
              sectionId: i.sectionId,
              name: i.name,
              description: i.description,
              imageUrl: i.imageUrl,
              imageUrl2: i.imageUrl2,
              price: i.price,
              trackStock: i.trackStock,
              inStock: !i.trackStock || i.stock > 0,
              useSectionTiming: i.useSectionTiming,
              availableFrom: i.availableFrom,
              availableTo: i.availableTo,
              availableDays: i.availableDays,
              tags: i.tags.map((t) => t.tag),
            })),
          }
        : null;

    return {
      ...shopPublic,
      gamingOfferings: gamingOfferings.map((o) => ({
        id: o.id,
        type: o.type,
        name: o.name,
        description: o.description,
        imageUrl: o.imageUrl,
        bookingMode: o.bookingMode,
        playstationGames: o.playstationGames,
        offeringConfig: o.offeringConfig,
        slotMinutes: o.slotMinutes,
        unitCount: o._count.resources,
        rates: o.rates,
      })),
      diningOfferings: diningOfferings.map((o) => ({
        id: o.id,
        type: o.type,
        name: o.name,
        description: o.description,
        imageUrl: o.imageUrl,
        bookingMode: o.bookingMode,
        slotMinutes: o.slotMinutes,
        unitCount: o._count.resources,
        rates: o.rates,
      })),
      scheduleExceptions,
      menu,
      features: {
        hasMenu: menuItems.length > 0,
        hasGaming: gamingOfferings.length > 0,
        hasDigitalDining: diningOfferings.some((o) => o._count.resources > 0),
        hasTableReservations: seatingCount > 0,
        hasGuestChat,
      },
    };
  }
}

const OFFERING_PRICE_KEYS = new Set([
  'pricePerPerson',
  'pricePerGame',
  'pricePerHour',
  'price',
  'hourlyRate',
  'basePrice',
]);

/** Deep-scale known price fields inside ResourceCategory.offeringConfig JSON. */
function scaleOfferingConfigPrices(
  config: unknown,
  scale: (n: number) => number,
): unknown {
  if (config == null || typeof config !== 'object') return config;
  let changed = false;

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((v) => walk(v));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (
          OFFERING_PRICE_KEYS.has(k) &&
          typeof v === 'number' &&
          Number.isFinite(v)
        ) {
          out[k] = scale(v);
          if (out[k] !== v) changed = true;
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return value;
  };

  const next = walk(config);
  return changed ? next : config;
}
