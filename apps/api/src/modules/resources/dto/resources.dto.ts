import { BookingMode, ResourceStatus, ResourceType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsOfferingConfig } from '../../../common/offering-config.util';

const FINITE_MONEY = { allowNaN: false, allowInfinity: false } as const;

export class ResourceRateDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsNumber(FINITE_MONEY)
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateCategoryDto {
  @IsEnum(ResourceType)
  type!: ResourceType;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  slotMinutes?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceRateDto)
  rates?: ResourceRateDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitNamePrefix?: string;

  @IsOptional()
  @IsEnum(BookingMode)
  bookingMode?: BookingMode;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  playstationGames?: string[];

  @IsOptional()
  @IsOfferingConfig()
  offeringConfig?: Record<string, unknown>;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(15)
  slotMinutes?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceRateDto)
  rates?: ResourceRateDto[];

  /** Sync seat/table/lane count to this total (adds or removes units). */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalUnits?: number;

  @IsOptional()
  @IsEnum(BookingMode)
  bookingMode?: BookingMode;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  playstationGames?: string[];

  @IsOptional()
  @IsOfferingConfig()
  offeringConfig?: Record<string, unknown>;
}

export class AddUnitsDto {
  @IsInt()
  @Min(1)
  count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  namePrefix?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsNumber(FINITE_MONEY)
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsEnum(ResourceStatus)
  status?: ResourceStatus;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(null|[a-z0-9]{20,})$/i, {
    message: 'sectionId must be null or a valid id.',
  })
  sectionId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  capacity?: number | null;
}

export class CreateGamingSectionDto {
  @IsString()
  @Matches(/^[a-z0-9]{20,}$/i, {
    message: 'categoryId must be a valid id.',
  })
  categoryId!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;

  @IsOptional()
  @IsBoolean()
  isVip?: boolean;

  @IsOptional()
  @IsNumber(FINITE_MONEY)
  @Min(0)
  hourlyPriceAddon?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(12)
  seatsPerRow?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  seatCount?: number;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  defaultTableCapacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  zone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateGamingSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;

  @IsOptional()
  @IsBoolean()
  isVip?: boolean;

  @IsOptional()
  @IsNumber(FINITE_MONEY)
  @Min(0)
  hourlyPriceAddon?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(12)
  seatsPerRow?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  seatCount?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  defaultTableCapacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  zone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateDiningTableGroupDto {
  @IsString()
  @Matches(/^[a-z0-9]{20,}$/i, {
    message: 'sectionId must be a valid id.',
  })
  sectionId!: string;

  @IsInt()
  @Min(1)
  @Max(8)
  capacity!: number;

  @IsInt()
  @Min(1)
  @Max(80)
  tableCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(12)
  seatsPerRow?: number;
}

export class UpdateDiningTableGroupDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  tableCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(12)
  seatsPerRow?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
