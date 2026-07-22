import { api, ApiError } from "./api";
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
  /** Set when the apply-template API was unavailable and client orchestration ran. */
  usedClientFallback?: boolean;
};

type ApplyOnboardingTemplateApiBody = {
  templateId: OnboardingTemplateId;
  replace?: boolean;
  previousCategoryIds?: string[];
};

type ApplyOnboardingTemplateApiResult = {
  templateId: string;
  categoryIds: string[];
};

function shouldFallbackToClientApply(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  // Old API deploy or local web-only — safe to seed via existing category APIs.
  return err.status === 0 || err.status === 404;
}

async function applyOnboardingTemplateViaApi(
  opts: ApplyOnboardingTemplateApiBody,
): Promise<ApplyTemplateResult> {
  const body: ApplyOnboardingTemplateApiBody = {
    templateId: opts.templateId,
  };
  if (opts.replace) body.replace = true;
  if (opts.previousCategoryIds?.length) {
    body.previousCategoryIds = opts.previousCategoryIds;
  }

  const result = await api<ApplyOnboardingTemplateApiResult>(
    "/shop/onboarding/apply-template",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  return {
    templateId: result.templateId as OnboardingTemplateId,
    categoryIds: result.categoryIds,
  };
}

/** Client-side orchestration — residual when apply-template route is absent. */
async function applyOnboardingTemplateClient(
  opts: ApplyOnboardingTemplateApiBody,
): Promise<ApplyTemplateResult> {
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

  return {
    templateId: template.id,
    categoryIds,
    usedClientFallback: true,
  };
}

/**
 * Apply an onboarding venue template.
 * Primary path: idempotent `POST /shop/onboarding/apply-template` (server derives key).
 * Residual fallback: client orchestration when the route is unreachable (404 / network).
 */
export async function applyOnboardingTemplate(
  opts: ApplyOnboardingTemplateApiBody,
): Promise<ApplyTemplateResult> {
  try {
    return await applyOnboardingTemplateViaApi(opts);
  } catch (err) {
    if (!shouldFallbackToClientApply(err)) throw err;
    if (typeof console !== "undefined") {
      console.warn(
        "[onboarding] apply-template API unavailable; using client orchestration fallback",
        err instanceof ApiError ? `${err.status} ${err.message}` : err,
      );
    }
    return applyOnboardingTemplateClient(opts);
  }
}
