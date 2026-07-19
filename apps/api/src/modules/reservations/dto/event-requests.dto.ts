import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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

export class CreatePublicEventRequestDto {
  @IsIn(EVENT_REQUEST_TYPE_VALUES)
  eventType!: (typeof EVENT_REQUEST_TYPE_VALUES)[number];

  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsInt()
  @Min(1)
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
  resourceCategoryId?: string;
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
