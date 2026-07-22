import { createHash } from 'crypto';
import type { ApplyOnboardingTemplateDto } from './dto/apply-onboarding-template.dto';

/** Stable idempotency key when header absent — scoped per shop in `withClientIdempotency`. */
export function deriveApplyTemplateIdempotencyKey(
  dto: ApplyOnboardingTemplateDto,
  headerKey?: string | null,
): string {
  const trimmed = headerKey?.trim();
  if (trimmed) return trimmed;

  if (dto.replace && dto.previousCategoryIds?.length) {
    const sorted = [...dto.previousCategoryIds].sort().join(',');
    const suffix = createHash('sha256').update(sorted).digest('hex').slice(0, 16);
    return `onboarding:${dto.templateId}:replace:${suffix}`;
  }

  return `onboarding:${dto.templateId}`;
}
