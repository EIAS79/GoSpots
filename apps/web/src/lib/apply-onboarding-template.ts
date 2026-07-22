import {
  createResourceCategory,
  deleteResourceCategory,
} from "./resources-client";
import { syncVenueCategories } from "./shop-settings-client";
import {
  getOnboardingTemplate,
  type OnboardingTemplateId,
} from "./onboarding-templates";

export type ApplyTemplateResult = {
  templateId: OnboardingTemplateId;
  categoryIds: string[];
};

/**
 * Seed resources + directory tags via existing APIs (no apply-template endpoint).
 * Idempotent when `previousCategoryIds` are deleted first on replace.
 */
export async function applyOnboardingTemplate(opts: {
  templateId: OnboardingTemplateId;
  /** When re-applying / replacing, delete these category ids first. */
  previousCategoryIds?: string[];
  replace?: boolean;
}): Promise<ApplyTemplateResult> {
  const template = getOnboardingTemplate(opts.templateId);
  if (!template) {
    throw new Error(`Unknown onboarding template: ${opts.templateId}`);
  }

  if (opts.replace && opts.previousCategoryIds?.length) {
    for (const id of opts.previousCategoryIds) {
      try {
        await deleteResourceCategory(id);
      } catch {
        /* category may already be gone */
      }
    }
  }

  const categoryIds: string[] = [];
  for (const seed of template.categories) {
    const created = await createResourceCategory({
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
    await syncVenueCategories({
      presetSlugs: template.categorySlugs,
      custom: [],
    });
  }

  return { templateId: template.id, categoryIds };
}
