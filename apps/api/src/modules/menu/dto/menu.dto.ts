import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CatalogItemKind, MealPeriod, TagType } from '@prisma/client';

const FINITE_MONEY = { allowNaN: false, allowInfinity: false } as const;

export class CreateSectionDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MealPeriod)
  mealPeriod?: MealPeriod;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableFrom?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableTo?: string;

  @IsOptional()
  @IsString()
  availableDays?: string;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MealPeriod)
  mealPeriod?: MealPeriod | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableFrom?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableTo?: string | null;

  @IsOptional()
  @IsString()
  availableDays?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;
}

export class CreateTagDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsEnum(TagType)
  type!: TagType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}

export class CreateMenuItemDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsEnum(CatalogItemKind)
  kind?: CatalogItemKind;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxCategoryKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl2?: string;

  @IsNumber(FINITE_MONEY)
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  useSectionTiming?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableFrom?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableTo?: string;

  @IsOptional()
  @IsString()
  availableDays?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  sectionId?: string | null;

  @IsOptional()
  @IsEnum(CatalogItemKind)
  kind?: CatalogItemKind;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxCategoryKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  imageUrl2?: string | null;

  @IsOptional()
  @IsNumber(FINITE_MONEY)
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  useSectionTiming?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableFrom?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  availableTo?: string | null;

  @IsOptional()
  @IsString()
  availableDays?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
