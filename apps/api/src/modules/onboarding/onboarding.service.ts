import { Injectable, NotFoundException } from '@nestjs/common';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ResourcesService } from '../resources/resources.service';
import { ShopService } from '../shop/shop.service';
import type { ApplyOnboardingTemplateDto } from './dto/apply-onboarding-template.dto';
import { getOnboardingTemplate } from './onboarding-templates.util';

export type ApplyOnboardingTemplateResult = {
  templateId: string;
  categoryIds: string[];
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly resources: ResourcesService,
    private readonly shop: ShopService,
  ) {}

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

    if (dto.replace && dto.previousCategoryIds?.length) {
      for (const id of dto.previousCategoryIds) {
        try {
          await this.resources.deleteCategory(actor, id);
        } catch {
          /* category may already be gone */
        }
      }
    }

    const categoryIds: string[] = [];
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
    }

    if (template.categorySlugs.length > 0) {
      await this.shop.syncVenueCategories(actor, {
        presetSlugs: template.categorySlugs,
        custom: [],
      });
    }

    return { templateId: template.id, categoryIds };
  }
}
