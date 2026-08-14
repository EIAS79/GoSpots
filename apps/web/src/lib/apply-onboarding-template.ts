import { api } from "./api";
import type { OnboardingTemplateId } from "./onboarding-templates";

export type ApplyTemplateResult = {
  templateId: OnboardingTemplateId;
  categoryIds: string[];
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

/**
 * Apply an onboarding venue template.
 * The server is the sole orchestration authority and enforces tenant scope,
 * feature availability and deterministic idempotency.
 */
export async function applyOnboardingTemplate(
  opts: ApplyOnboardingTemplateApiBody,
): Promise<ApplyTemplateResult> {
  return applyOnboardingTemplateViaApi(opts);
}
