import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';
import type { OnboardingTemplateId } from '../onboarding-templates.util';

const TEMPLATE_IDS = [
  'billiard_hall',
  'console_lounge',
  'pc_cafe',
  'bowling_center',
  'mixed_activity',
] as const satisfies readonly OnboardingTemplateId[];

export class ApplyOnboardingTemplateDto {
  @IsIn(TEMPLATE_IDS)
  templateId!: OnboardingTemplateId;

  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  /** When re-applying / replacing, delete these category ids first (best-effort). */
  @IsOptional()
  @IsArray()
  @Matches(/^[a-z0-9]{20,}$/i, { each: true })
  previousCategoryIds?: string[];
}
