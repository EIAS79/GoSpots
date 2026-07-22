import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SEATING_ZONE_VALUES } from './seating-tables.dto';

export const EVENT_REQUEST_TYPE_VALUES = [
  'TABLE',
  'GAMING',
  'BIRTHDAY',
  'MEETING',
  'PARTY',
  'CORPORATE',
  'OTHER',
] as const;

export const EVENT_REQUEST_SOURCE_VALUES = [
  'CLIENT_WEB',
  'PHONE',
  'STAFF',
] as const;

export const EVENT_REQUEST_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'CANCELED',
] as const;

export class EventRequestQueryDto {
  @IsOptional()
  @IsIn(EVENT_REQUEST_STATUS_VALUES)
  status?: (typeof EVENT_REQUEST_STATUS_VALUES)[number];
}

/**
 * Public guest event-request create.
 * shopId is never accepted from the body — the published venue slug resolves it.
 * Contact: email and/or phone required (enforced in service).
 */
export class CreatePublicEventRequestDto {
  @IsIn(EVENT_REQUEST_TYPE_VALUES)
  eventType!: (typeof EVENT_REQUEST_TYPE_VALUES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  guestPhone?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  partySize!: number;

  @IsDateString()
  preferredStartsAt!: string;

  @IsOptional()
  @IsDateString()
  preferredEndsAt?: string;

  @IsOptional()
  @IsIn(SEATING_ZONE_VALUES)
  zone?: (typeof SEATING_ZONE_VALUES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  resourceCategoryId?: string;

  /** Required on public create; staff path may omit. */
  @IsOptional()
  @IsBoolean()
  privacyConsentAccepted?: boolean;

  /** Optional CAPTCHA token (Turnstile/hCaptcha). Required only when provider+mode enforce. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

export class CreateStaffEventRequestDto extends CreatePublicEventRequestDto {
  @IsOptional()
  @IsIn(EVENT_REQUEST_SOURCE_VALUES)
  source?: (typeof EVENT_REQUEST_SOURCE_VALUES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;
}

export class ReviewEventRequestDto {
  @IsIn(['approve', 'decline'])
  action!: 'approve' | 'decline';

  @ValidateIf((o: ReviewEventRequestDto) => o.action === 'decline')
  @IsString()
  @MaxLength(1000)
  staffResponseNote?: string;

  @IsOptional()
  @IsBoolean()
  createFloorBlock?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  floorBlockLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;
}
