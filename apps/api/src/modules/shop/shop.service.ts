import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TagType } from '@prisma/client';
import { FEATURED_GAME_TYPES, DINING_TYPES } from '../../common/booking-unit-kind';
import {
  buildDashboardPath,
  dashboardKeyPersistFields,
  generateDashboardKey,
} from '../../common/dashboard-path';
import {
  isSupportedCurrency,
  isSupportedLocale,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from '../../common/locale-currency';
import { isValidIanaTimeZone } from '../../common/venue-timezone.util';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import {
  slugifyVenueCategory,
  venueCategoryPreset,
  VENUE_CATEGORY_PRESETS,
} from '../../common/venue-categories';
import { sectionImageUrlsByShop } from '../../common/menu-section-image.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import {
  assertShopHasFeature,
  getVenueEntitlements,
  hasFeature,
} from '../../common/venue-entitlements';
import {
  assertUserPassword,
  requireConfirmPassword,
} from '../../common/security/verify-password.util';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyRatesService } from './currency-rates.service';
import {
  ConvertCurrencyDto,
  PreviewCurrencyChangeDto,
  RotateDashboardKeyDto,
  SyncVenueCategoriesDto,
  UpdateShopSettingsDto,
} from './dto/shop-settings.dto';
import { mapOfferingConfigPrices, prepareOfferingConfigForWrite } from '../../common/offering-config.util';
import {
  serializeMoney,
  toMoneyNumber,
  toPrismaDecimal,
} from '../../common/money.util';

type CatalogCurrencyPlan = {
  from: string;
  to: string;
  rate: number;
  ratesAt: string;
  menuItems: {
    id: string;
    name: string;
    priceBefore: number;
    priceAfter: number;
  }[];
  resourceRates: {
    id: string;
    label: string;
    categoryId: string;
    priceBefore: number;
    priceAfter: number;
  }[];
  resources: {
    id: string;
    name: string;
    hourlyRateBefore: number;
    hourlyRateAfter: number;
  }[];
  offerings: {
    id: string;
    name: string;
    offeringConfigBefore: unknown;
    offeringConfigAfter: object;
  }[];
};

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

  private assertOwner(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException('No venue selected.');
    if (actor.shopRole !== 'OWNER') {
      throw new ForbiddenException('Owner role required to rotate dashboard key.');
    }
  }

  /**
   * Owner-only: regenerate Shop.dashboardKey (+ hash) after password reauth.
   * Phase 3: bind is membership/slug-only — rotate dual-writes hash-at-rest.
   */
  async rotateDashboardKey(
    actor: JwtAccessPayload,
    dto: RotateDashboardKeyDto,
    confirmPasswordHeader?: string,
  ) {
    this.assertOwner(actor);
    const shopId = requireShopId(actor);

    const password = requireConfirmPassword(
      dto.password,
      confirmPasswordHeader,
    );
    await assertUserPassword(this.prisma, actor.sub, password);

    const before = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, slug: true, dashboardKey: true },
    });
    if (!before) throw new NotFoundException('Venue not found.');

    const maxAttempts = 5;
    let updated: { slug: string; dashboardKey: string } | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const nextKey = generateDashboardKey();
      if (nextKey === before.dashboardKey) continue;
      try {
        updated = await this.prisma.shop.update({
          where: { id: shopId },
          data: dashboardKeyPersistFields(nextKey),
          select: { slug: true, dashboardKey: true },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    if (!updated) {
      throw new BadRequestException(
        'Could not allocate a unique dashboard key. Try again.',
      );
    }

    await this.audit.record(actor, {
      section: 'venue',
      action: 'shop.dashboard_key.rotate',
      summary: 'Rotated venue dashboard capability key',
      meta: { shopId, rotated: true },
    });

    return {
      slug: updated.slug,
      dashboardPath: buildDashboardPath(updated.slug, updated.dashboardKey),
    };
  }

  private shopProfileSelect() {
    return {
      id: true,
      version: true,
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
      timezone: true,
      businessDayStartMinutes: true,
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
    if (dto.expectedVersion !== before.version) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Venue settings changed in another session. Reload and try again.',
        { aggregateType: 'shop', aggregateId: shopId },
      );
    }

    if (dto.locale != null && !isSupportedLocale(dto.locale)) {
      throw new BadRequestException('Unsupported language.');
    }
    if (dto.timezone != null) {
      const tz = dto.timezone.trim();
      if (!tz || !isValidIanaTimeZone(tz)) {
        throw new BadRequestException(
          'Unsupported timezone. Use a valid IANA name (e.g. Europe/Warsaw).',
        );
      }
      dto.timezone = tz;
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
      await assertShopHasFeature(this.prisma, shopId, 'marketing');
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
      if (dto.confirm !== true) {
        throw new BadRequestException(
          'Currency change requires confirm: true. Call POST /shop/currency/preview first.',
        );
      }
      currencyConversion = await this.repriceCatalogToCurrency(
        shopId,
        before.currency,
        nextCurrency,
      );
    }

    let shop: NonNullable<typeof before>;
    try {
      shop = await this.prisma.shop.update({
        where: {
          id: shopId,
          version: dto.expectedVersion,
        },
        data: {
          version: { increment: 1 },
          ...(dto.locale != null && { locale: dto.locale }),
          ...(dto.timezone != null && { timezone: dto.timezone }),
          ...(dto.businessDayStartMinutes != null && {
            businessDayStartMinutes: dto.businessDayStartMinutes,
          }),
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
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw apiConflictException(
          ApiDomainErrorCode.VERSION_CONFLICT,
          'Venue settings changed in another session. Reload and try again.',
          { aggregateType: 'shop', aggregateId: shopId },
        );
      }
      throw error;
    }

    const changes: string[] = [];
    if (dto.locale != null && dto.locale !== before.locale) {
      changes.push(`language → ${dto.locale}`);
    }
    if (dto.timezone != null && dto.timezone !== before.timezone) {
      changes.push(`timezone → ${dto.timezone}`);
    }
    if (
      dto.businessDayStartMinutes != null &&
      dto.businessDayStartMinutes !== before.businessDayStartMinutes
    ) {
      changes.push(`business day start → ${dto.businessDayStartMinutes} minutes`);
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
        previousState: before,
        newState: shop,
        meta: { before, after: shop },
      });
    }

    if (currencyChanged && currencyConversion) {
      await this.audit.record(actor, {
        section: 'venue',
        action: 'venue.currency.change',
        summary: `Currency ${before.currency} → ${nextCurrency} (catalog ×${currencyConversion.rate.toFixed(6)})`,
        meta: {
          from: before.currency,
          to: nextCurrency,
          rate: currencyConversion.rate,
          ratesAt: currencyConversion.ratesAt,
          menuItems: currencyConversion.menuItems,
          resourceRates: currencyConversion.resourceRates,
          resources: currencyConversion.resources,
          offerings: currencyConversion.offerings,
        },
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
   * Catalog FX conversion history for settings UI.
   * Prefer dedicated `venue.currency.change` audits; also parse legacy
   * `venue.settings.update` rows that flipped currency before this lane.
   */
  async listCurrencyHistory(actor: JwtAccessPayload, take = 30) {
    this.assertVenueSettingsWrite(actor);
    const shopId = requireShopId(actor);
    const limit = Math.min(Math.max(take, 1), 100);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        shopId,
        OR: [
          { action: 'venue.currency.change' },
          {
            action: 'venue.settings.update',
            summary: { contains: 'currency →' },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
      select: {
        id: true,
        action: true,
        summary: true,
        meta: true,
        actorName: true,
        actorEmail: true,
        createdAt: true,
      },
    });

    const history: Array<{
      id: string;
      createdAt: string;
      from: string;
      to: string;
      rate: number | null;
      ratesAt: string | null;
      menuItems: number | null;
      resourceRates: number | null;
      resources: number | null;
      offerings: number | null;
      actorName: string | null;
      actorEmail: string | null;
      summary: string;
    }> = [];

    for (const row of rows) {
      let meta: Record<string, unknown> = {};
      if (row.meta) {
        try {
          meta = JSON.parse(row.meta) as Record<string, unknown>;
        } catch {
          meta = {};
        }
      }

      let from: string | null = null;
      let to: string | null = null;
      let rate: number | null =
        typeof meta.rate === 'number' ? meta.rate : null;
      const ratesAt: string | null =
        typeof meta.ratesAt === 'string' ? meta.ratesAt : null;
      const menuItems: number | null =
        typeof meta.menuItems === 'number' ? meta.menuItems : null;
      const resourceRates: number | null =
        typeof meta.resourceRates === 'number' ? meta.resourceRates : null;
      const resources: number | null =
        typeof meta.resources === 'number' ? meta.resources : null;
      const offerings: number | null =
        typeof meta.offerings === 'number' ? meta.offerings : null;

      if (row.action === 'venue.currency.change') {
        from =
          typeof meta.from === 'string' ? meta.from.toUpperCase() : null;
        to = typeof meta.to === 'string' ? meta.to.toUpperCase() : null;
      } else {
        const before = meta.before as { currency?: string } | undefined;
        const after = meta.after as { currency?: string } | undefined;
        from = before?.currency?.toUpperCase() ?? null;
        to = after?.currency?.toUpperCase() ?? null;
        if (!from || !to || from === to) continue;
        const m = row.summary.match(/catalog ×([0-9.]+)/);
        if (m && rate == null) rate = Number(m[1]);
      }

      if (!from || !to || from === to) continue;

      history.push({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        from,
        to,
        rate,
        ratesAt,
        menuItems,
        resourceRates,
        resources,
        offerings,
        actorName: row.actorName,
        actorEmail: row.actorEmail,
        summary: row.summary,
      });
      if (history.length >= limit) break;
    }

    return { items: history };
  }

  /**
   * Proposed catalog price table for a currency change (no writes).
   * Historical ShopOrder / Transaction / PlaySession amounts are never included
   * or mutated — only live catalog rows.
   */
  async previewCurrencyChange(
    actor: JwtAccessPayload,
    dto: PreviewCurrencyChangeDto,
  ) {
    this.assertVenueSettingsWrite(actor);
    const shopId = requireShopId(actor);

    if (!isSupportedCurrency(dto.currency)) {
      throw new BadRequestException('Unsupported currency.');
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    if (!shop) throw new NotFoundException();

    const to = dto.currency.toUpperCase();
    const from = shop.currency.toUpperCase();
    if (to === from) {
      return {
        from,
        to,
        rate: 1,
        ratesAt: new Date().toISOString(),
        historicalOrdersUntouched: true as const,
        summary: {
          menuItems: 0,
          resourceRates: 0,
          resources: 0,
          offerings: 0,
        },
        menuItems: [] as CatalogCurrencyPlan['menuItems'],
        resourceRates: [] as CatalogCurrencyPlan['resourceRates'],
        resources: [] as CatalogCurrencyPlan['resources'],
        offerings: [] as CatalogCurrencyPlan['offerings'],
      };
    }

    const plan = await this.buildCatalogCurrencyPlan(shopId, from, to);
    return {
      from: plan.from,
      to: plan.to,
      rate: plan.rate,
      ratesAt: plan.ratesAt,
      historicalOrdersUntouched: true as const,
      summary: {
        menuItems: plan.menuItems.length,
        resourceRates: plan.resourceRates.length,
        resources: plan.resources.length,
        offerings: plan.offerings.length,
      },
      menuItems: plan.menuItems,
      resourceRates: plan.resourceRates,
      resources: plan.resources,
      offerings: plan.offerings,
    };
  }

  /**
   * Rewrite live catalog amounts into the new shop currency using a fresh FX rate.
   * All catalog price writes run in one `$transaction` (all-or-nothing).
   * Historical orders/transactions keep their original numbers (past sales).
   * Missing / invalid FX rates are rejected before any write.
   */
  private async repriceCatalogToCurrency(
    shopId: string,
    from: string,
    to: string,
  ) {
    const plan = await this.buildCatalogCurrencyPlan(shopId, from, to);

    await this.prisma.$transaction(async (tx) => {
      for (const item of plan.menuItems) {
        await tx.menuItem.update({
          where: { id: item.id },
          data: { price: toPrismaDecimal(item.priceAfter) },
        });
      }

      for (const r of plan.resourceRates) {
        await tx.resourceRate.update({
          where: { id: r.id },
          data: { price: toPrismaDecimal(r.priceAfter) },
        });
      }

      for (const u of plan.offerings) {
        await tx.resourceCategory.update({
          where: { id: u.id },
          data: { offeringConfig: u.offeringConfigAfter },
        });
      }

      for (const res of plan.resources) {
        await tx.resource.update({
          where: { id: res.id },
          data: { hourlyRate: toPrismaDecimal(res.hourlyRateAfter) },
        });
      }
    });

    return {
      from: plan.from,
      to: plan.to,
      rate: plan.rate,
      ratesAt: plan.ratesAt,
      menuItems: plan.menuItems.length,
      resourceRates: plan.resourceRates.length,
      resources: plan.resources.length,
      offerings: plan.offerings.length,
    };
  }

  /**
   * Load live catalog + FX and compute proposed before/after prices.
   * Does not write. Never touches ShopOrder / Transaction / PlaySession / ShopLoss.
   */
  private async buildCatalogCurrencyPlan(
    shopId: string,
    from: string,
    to: string,
  ): Promise<CatalogCurrencyPlan> {
    const { rate, ratesAt } = await this.rates.getRate(from, to, {
      forceRefresh: true,
    });
    // Reject bad rates before touching the catalog (getRate already guards;
    // convertAmount re-checks so a stale caller cannot pass rate ≤ 0).
    this.rates.convertAmount(1, rate);

    const [menuItems, categories, resources] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { shopId },
        select: { id: true, name: true, price: true },
      }),
      this.prisma.resourceCategory.findMany({
        where: { shopId },
        select: {
          id: true,
          name: true,
          offeringConfig: true,
          rates: { select: { id: true, label: true, price: true } },
        },
      }),
      this.prisma.resource.findMany({
        where: { shopId },
        select: { id: true, name: true, hourlyRate: true },
      }),
    ]);

    const menuPlan = menuItems.map((item) => {
      const priceBefore = toMoneyNumber(item.price);
      return {
        id: item.id,
        name: item.name,
        priceBefore,
        priceAfter: this.rates.convertAmount(priceBefore, rate),
      };
    });

    const resourceRatePlan = categories.flatMap((cat) =>
      cat.rates.map((r) => {
        const priceBefore = toMoneyNumber(r.price);
        return {
          id: r.id,
          label: r.label,
          categoryId: cat.id,
          priceBefore,
          priceAfter: this.rates.convertAmount(priceBefore, rate),
        };
      }),
    );

    const offeringPlan: CatalogCurrencyPlan['offerings'] = [];
    for (const cat of categories) {
      const nextConfig = prepareOfferingConfigForWrite(
        mapOfferingConfigPrices(cat.offeringConfig, (n) =>
          this.rates.convertAmount(toMoneyNumber(n), rate),
        ),
      );
      if (nextConfig !== cat.offeringConfig) {
        offeringPlan.push({
          id: cat.id,
          name: cat.name,
          offeringConfigBefore: cat.offeringConfig,
          offeringConfigAfter: nextConfig as object,
        });
      }
    }

    const resourcePlan = resources
      .filter((r) => toMoneyNumber(r.hourlyRate) !== 0)
      .map((res) => {
        const hourlyRateBefore = toMoneyNumber(res.hourlyRate);
        return {
          id: res.id,
          name: res.name,
          hourlyRateBefore,
          hourlyRateAfter: this.rates.convertAmount(hourlyRateBefore, rate),
        };
      });

    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      ratesAt,
      menuItems: menuPlan,
      resourceRates: resourceRatePlan,
      resources: resourcePlan,
      offerings: offeringPlan,
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
      timezone: true,
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
        const scheduleExceptions = raw.map((exception) => {
          const { shopId, ...rest } = exception;
          void shopId;
          return rest;
        });
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
        timezone: true,
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
            addOnRows: { select: { addOnId: true } },
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

    const entitlements = getVenueEntitlements(shop.subscription);
    const hasGuestChat = hasFeature(entitlements, 'messaging');
    const { subscription: _subscription, ...shopPublic } = shop;
    void _subscription;

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
              price: serializeMoney(i.price),
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
        offeringConfig: mapOfferingConfigPrices(
          o.offeringConfig,
          (n) => serializeMoney(n),
        ),
        slotMinutes: o.slotMinutes,
        unitCount: o._count.resources,
        rates: o.rates.map((r) => ({
          ...r,
          price: serializeMoney(r.price),
        })),
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
        rates: o.rates.map((r) => ({
          ...r,
          price: serializeMoney(r.price),
        })),
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
