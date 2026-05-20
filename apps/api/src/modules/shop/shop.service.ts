import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  isSupportedCurrency,
  isSupportedLocale,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from "../../common/locale-currency";
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
    return {
      shop,
      locales: SUPPORTED_LOCALES,
      currencies: SUPPORTED_CURRENCIES,
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

    return {
      shop,
      locales: SUPPORTED_LOCALES,
      currencies: SUPPORTED_CURRENCIES,
    };
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
  async listPublicVenues() {
    return this.prisma.shop.findMany({
      where: { isPublished: true },
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
      },
      orderBy: { name: "asc" },
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
      },
    });
    if (!shop) throw new NotFoundException("Venue not found.");
    return shop;
  }
}
