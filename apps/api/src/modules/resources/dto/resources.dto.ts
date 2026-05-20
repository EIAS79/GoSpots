import { ResourceStatus, ResourceType } from "@prisma/client";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ResourceRateDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsNumber()
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
  @Min(1)
  unitCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitNamePrefix?: string;
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
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsEnum(ResourceStatus)
  status?: ResourceStatus;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
