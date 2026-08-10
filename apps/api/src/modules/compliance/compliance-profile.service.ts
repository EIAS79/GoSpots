import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ComplianceSecretCryptoService } from './compliance-secret.crypto';
import type {
  ConfigureComplianceProfileDto,
  UpsertFiscalDeviceDto,
  UpsertTaxCategoryDto,
} from './dto/compliance.dto';

@Injectable()
export class ComplianceProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ComplianceSecretCryptoService,
  ) {}

  private assertManage(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE)) return;
    throw new ForbiddenException('Missing shop.manage permission');
  }

  private assertRead(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_READ)) return;
    throw new ForbiddenException('Missing transaction.read permission');
  }

  private async assertPolandShop(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { country: true },
    });
    const country = shop?.country?.trim().toUpperCase();
    if (country !== 'PL' && country !== 'POLAND' && country !== 'POLSKA') {
      throw new ForbiddenException('Poland compliance is only available to Poland venues');
    }
  }

  private aad(shopId: string) {
    return `${shopId}:PL:KSEF_TOKEN`;
  }

  private sanitized<T extends { ksefTokenEncrypted?: string | null }>(profile: T) {
    const { ksefTokenEncrypted, ...safe } = profile;
    return { ...safe, hasKsefToken: Boolean(ksefTokenEncrypted) };
  }

  async getProfile(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    await this.assertPolandShop(shopId);
    const profile = await this.prisma.complianceProfile.findUnique({ where: { shopId } });
    return profile ? this.sanitized(profile) : null;
  }

  async configureProfile(actor: JwtAccessPayload, dto: ConfigureComplianceProfileDto) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    await this.assertPolandShop(shopId);

    const existing = await this.prisma.complianceProfile.findUnique({ where: { shopId } });
    const token = dto.ksefToken?.trim();
    const encrypted = token ? this.crypto.encrypt(token, this.aad(shopId)) : undefined;
    const defaultCode = dto.defaultTaxCategoryCode?.trim() || null;
    if (defaultCode) {
      const category = await this.prisma.taxCategory.findUnique({
        where: { shopId_code: { shopId, code: defaultCode } },
        select: { active: true },
      });
      if (!category?.active) {
        throw new BadRequestException('Default tax category must exist and be active');
      }
    }

    const profile = await this.prisma.complianceProfile.upsert({
      where: { shopId },
      create: {
        shopId,
        jurisdiction: 'PL',
        legalName: dto.legalName.trim(),
        taxId: dto.taxId.trim(),
        streetAddress: dto.streetAddress.trim(),
        postalCode: dto.postalCode.trim(),
        city: dto.city.trim(),
        countryCode: 'PL',
        defaultTaxCategoryCode: defaultCode,
        ksefEnvironment: dto.ksefEnvironment ?? 'TEST',
        ...(encrypted ? { ksefTokenEncrypted: encrypted } : {}),
      },
      update: {
        legalName: dto.legalName.trim(),
        taxId: dto.taxId.trim(),
        streetAddress: dto.streetAddress.trim(),
        postalCode: dto.postalCode.trim(),
        city: dto.city.trim(),
        defaultTaxCategoryCode: defaultCode,
        ksefEnvironment: dto.ksefEnvironment ?? existing?.ksefEnvironment ?? 'TEST',
        ...(encrypted ? { ksefTokenEncrypted: encrypted } : {}),
      },
    });
    return this.sanitized(profile);
  }

  async getKsefContext(shopId: string) {
    const profile = await this.prisma.complianceProfile.findUnique({ where: { shopId } });
    if (!profile) throw new NotFoundException('Compliance profile is not configured');
    return {
      profile,
      ksefToken: profile.ksefTokenEncrypted
        ? this.crypto.decrypt(profile.ksefTokenEncrypted, this.aad(shopId))
        : null,
    };
  }

  async listTaxCategories(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    return this.prisma.taxCategory.findMany({
      where: { shopId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
  }

  async upsertTaxCategory(actor: JwtAccessPayload, dto: UpsertTaxCategoryDto) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    await this.assertPolandShop(shopId);
    const rate = new Prisma.Decimal(dto.ratePercent);
    if (!rate.isFinite() || rate.lt(0) || rate.gt(100)) {
      throw new BadRequestException('Tax rate must be between 0 and 100');
    }
    const code = dto.code.trim().toUpperCase();
    return this.prisma.taxCategory.upsert({
      where: { shopId_code: { shopId, code } },
      create: {
        shopId,
        code,
        label: dto.label.trim(),
        ratePercent: rate,
        active: dto.active ?? true,
      },
      update: {
        label: dto.label.trim(),
        ratePercent: rate,
        active: dto.active ?? true,
      },
    });
  }

  async listFiscalDevices(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    return this.prisma.fiscalDevice.findMany({
      where: { shopId },
      orderBy: [{ enabled: 'desc' }, { label: 'asc' }],
    });
  }

  async upsertFiscalDevice(actor: JwtAccessPayload, dto: UpsertFiscalDeviceDto) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    await this.assertPolandShop(shopId);
    const label = dto.label.trim();
    return this.prisma.fiscalDevice.upsert({
      where: { shopId_label: { shopId, label } },
      create: {
        shopId,
        label,
        provider: dto.provider.trim().toUpperCase(),
        externalDeviceId: dto.externalDeviceId?.trim() || null,
        enabled: dto.enabled ?? true,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        provider: dto.provider.trim().toUpperCase(),
        externalDeviceId: dto.externalDeviceId?.trim() || null,
        enabled: dto.enabled ?? true,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
