import { OperationsBillingMode, Prisma } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseAddOns,
  recommendedFeaturesForPack,
  resolveAddOnsCsv,
  serializeAddOns,
  syncSubscriptionAddOnRows,
  type AddOnId,
} from '../../common/venue-packs';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ResourcesService } from '../resources/resources.service';
import { ShopService } from '../shop/shop.service';
import { OperationsService } from '../operations/operations.service';
import type { ApplyOnboardingTemplateDto } from './dto/apply-onboarding-template.dto';
import { getOnboardingTemplate } from './onboarding-templates.util';

export type ApplyOnboardingTemplateResult = {
  templateId: string;
  categoryIds: string[];
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourcesService,
    private readonly shop: ShopService,
    private readonly operations: OperationsService,
  ) {}

  /**
   * Trials that registered with empty add-ons can't create resources.
   * Merge the pack's recommended features so starter templates can seed.
   */
  private async ensureRecommendedFeaturesForShop(shopId: string): Promise<void> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        subscription: { include: { addOnRows: true } },
      },
    });
    const sub = shop?.subscription;
    if (!sub || sub.status !== 'TRIAL') return;

    const current = parseAddOns(
      resolveAddOnsCsv({
        addOnRows: sub.addOnRows,
      }),
    );
    const recommended = recommendedFeaturesForPack(sub.packId);
    const merged = Array.from(new Set<AddOnId>([...current, ...recommended]));
    if (merged.length === current.length) return;

    const csv = serializeAddOns(merged);
    await syncSubscriptionAddOnRows(this.prisma, sub.id, csv);
  }

  /**
   * Seed resource categories + directory tags via existing category APIs.
   * Idempotency is enforced at the controller layer (shopId + template key).
   */
  async applyTemplate(
    actor: JwtAccessPayload,
    dto: ApplyOnboardingTemplateDto,
  ): Promise<ApplyOnboardingTemplateResult> {
    const template = getOnboardingTemplate(dto.templateId);
    if (!template) {
      throw new NotFoundException(`Unknown onboarding template: ${dto.templateId}`);
    }

    if (!actor.shopId) {
      throw new NotFoundException('No venue bound to this session.');
    }
    const shopId = actor.shopId;
    await this.ensureRecommendedFeaturesForShop(shopId);

    if (dto.replace && dto.previousCategoryIds?.length) {
      await this.prisma.operationsRatePlan.deleteMany({
        where: {
          shopId,
          resourceCategoryId: { in: dto.previousCategoryIds },
        },
      });
      for (const id of dto.previousCategoryIds) {
        try {
          await this.resources.deleteCategory(actor, id);
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
        }
      }
    }

    const categoryIds: string[] = [];
    try {
      for (const seed of template.categories) {
        const created = await this.resources.createCategory(actor, {
          type: seed.type,
          name: seed.name,
          bookingMode: seed.bookingMode,
          slotMinutes: seed.slotMinutes,
          unitCount: seed.unitCount,
          unitNamePrefix: seed.unitNamePrefix,
          rates: seed.rates,
          offeringConfig: seed.offeringConfig,
        });
        categoryIds.push(created.id);
        const primaryRate = seed.rates[0];
        if (primaryRate) {
          const billingMode =
            seed.bookingMode === 'GAME'
              ? OperationsBillingMode.PER_GAME
              : seed.bookingMode === 'PERSON'
                ? OperationsBillingMode.PER_PERSON
                : OperationsBillingMode.HOURLY;
          const priceMinor = new Prisma.Decimal(String(primaryRate.price))
            .mul(100)
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber();
          const hourlyRateMinor =
            billingMode === OperationsBillingMode.HOURLY
              ? new Prisma.Decimal(priceMinor)
                  .mul(60)
                  .div(primaryRate.durationMinutes ?? 60)
                  .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
                  .toNumber()
              : 0;
          await this.operations.createRatePlan(actor, {
            name: `${seed.name} — ${primaryRate.label}`,
            resourceCategoryId: created.id,
            billingMode,
            hourlyRateMinor,
            unitPriceMinor:
              billingMode === OperationsBillingMode.HOURLY
                ? hourlyRateMinor
                : priceMinor,
            roundingMinutes: 1,
            minimumMinutes: 0,
            active: true,
          });
        }
      }

      if (template.categorySlugs.length > 0) {
        await this.shop.syncVenueCategories(actor, {
          presetSlugs: template.categorySlugs,
          custom: [],
        });
      }
    } catch (error) {
      await this.cleanupFreshCategories(shopId, categoryIds);
      throw error;
    }

    return { templateId: template.id, categoryIds };
  }

  private async cleanupFreshCategories(shopId: string, categoryIds: string[]) {
    if (!categoryIds.length) return;
    const resources = await this.prisma.resource.findMany({
      where: { shopId, categoryId: { in: categoryIds } },
      select: { id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.operationsRatePlan.deleteMany({
        where: {
          shopId,
          OR: [
            { resourceCategoryId: { in: categoryIds } },
            { resourceId: { in: resources.map((resource) => resource.id) } },
          ],
        },
      });
      await tx.resource.deleteMany({
        where: { shopId, categoryId: { in: categoryIds } },
      });
      await tx.resourceCategory.deleteMany({
        where: { shopId, id: { in: categoryIds } },
      });
    });
  }

  async readiness(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new NotFoundException('No venue bound to this session.');
    const shopId = actor.shopId;
    const [
      shop,
      hours,
      zones,
      resources,
      rates,
      catalogItems,
      staff,
      devices,
      terminals,
      compliance,
      testSessions,
    ] = await Promise.all([
      this.prisma.shop.findUnique({
        where: { id: shopId },
        select: {
          name: true,
          legalName: true,
          venueType: true,
          address: true,
          city: true,
          country: true,
          currency: true,
          locale: true,
          timezone: true,
          businessDayStartMinutes: true,
        },
      }),
      this.prisma.openingHour.count({ where: { shopId } }),
      this.prisma.gamingSection.count({ where: { shopId, isHidden: false } }),
      this.prisma.resource.count({ where: { shopId } }),
      this.prisma.operationsRatePlan.count({ where: { shopId, active: true } }),
      this.prisma.menuItem.count({ where: { shopId, isAvailable: true } }),
      this.prisma.membership.count({ where: { shopId, isActive: true } }),
      this.prisma.device.count({ where: { shopId, status: 'ACTIVE' } }),
      this.prisma.paymentTerminal.count({ where: { shopId, enabled: true } }),
      this.prisma.complianceProfile.count({ where: { shopId } }),
      this.prisma.operationsSession.count({ where: { shopId } }),
    ]);
    if (!shop) throw new NotFoundException('Venue not found.');

    const profileComplete = Boolean(
      shop.name && shop.legalName && shop.venueType && shop.address &&
      shop.city && shop.country && shop.currency && shop.locale && shop.timezone,
    );
    const required = {
      profile: profileComplete,
      time: hours === 7,
      floor: zones > 0,
      resources: resources > 0,
      rates: rates > 0,
      staff: staff > 0,
      test: testSessions > 0,
    };
    const operational = Object.values(required).every(Boolean);
    const step = (
      key: string,
      label: string,
      complete: boolean,
      optional = false,
      detail?: string,
    ) => ({
      key,
      label,
      complete,
      status: complete ? 'COMPLETE' : optional ? 'OPTIONAL' : 'REQUIRED',
      detail: detail ?? null,
    });
    const steps = [
      step('venue_profile', 'Venue type and business profile', required.profile),
      step('time_business_day', 'Timezone, business day and opening hours', required.time),
      step('floor_zones', 'Floor and zones', required.floor, false, `${zones} configured`),
      step('resources', 'Resources', required.resources, false, `${resources} configured`),
      step('rates', 'Rate rules', required.rates, false, `${rates} active`),
      step('catalog', 'Product and service catalog', catalogItems > 0, true, `${catalogItems} active`),
      step('staff', 'Staff access', required.staff, false, `${staff} active`),
      step('devices', 'Device registry', devices > 0, true, `${devices} active`),
      step('payment', 'Payment integration', terminals > 0, true, `${terminals} enabled`),
      step('fiscal', 'Tax and fiscal profile', compliance > 0, true),
      step('test', 'Test session or order', required.test),
      step('readiness', 'Operational readiness', operational),
    ];
    return {
      phase: 2,
      operational,
      required,
      steps,
      counts: { hours, zones, resources, rates, catalogItems, staff, devices, terminals, compliance, testSessions },
      checkedAt: new Date().toISOString(),
    };
  }
}
