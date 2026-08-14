import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from '../../../common/locale-currency';

const LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code);
const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

export class UpdateShopSettingsDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @IsIn([...LOCALE_CODES])
  locale?: string;

  /**
   * IANA timezone for venue-local calendar days (stock reset, finance day buckets).
   * Example: `Europe/Warsaw`. Validated in ShopService.updateSettings.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  businessDayStartMinutes?: number;

  @IsOptional()
  @IsString()
  @IsIn([...CURRENCY_CODES])
  currency?: string;

  /**
   * Required `true` when `currency` changes the shop currency.
   * Preview first via `POST /shop/currency/preview`; apply only with confirm.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,23}$/i, {
    message: 'branchCode must use letters, numbers, underscore or hyphen.',
  })
  branchCode?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['gaming', 'dining', 'bar', 'hotel_fb', 'mixed'])
  venueType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string | null;

  @IsOptional()
  @IsObject()
  taxProfile?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  receiptBranding?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  advertiseOnVenuesPage?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ENABLED', 'DISABLED', 'HIDDEN'])
  reviewsMode?: 'ENABLED' | 'DISABLED' | 'HIDDEN';

  /** Building levels for dining seating (1–10). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  floorCount?: number;
}
export class CustomVenueCategoryDto {
  @IsString()
  @MaxLength(48)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;
}

export class SyncVenueCategoriesDto {
  /** Preset slugs from VENUE_CATEGORY_PRESETS */
  @IsArray()
  @IsString({ each: true })
  presetSlugs!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomVenueCategoryDto)
  custom?: CustomVenueCategoryDto[];
}

/** Preview catalog FX reprice without writing. */
export class PreviewCurrencyChangeDto {
  @IsString()
  @IsIn([...CURRENCY_CODES])
  currency!: string;
}

export class ConvertCurrencyDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @IsIn([...CURRENCY_CODES])
  from!: string;

  /** Single target currency */
  @IsOptional()
  @IsString()
  @IsIn([...CURRENCY_CODES])
  to?: string;

  /** Multiple targets (e.g. show prices in EUR, USD, PLN at once) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toCurrencies?: string[];
}

/** Owner-only dashboard capability key rotate (bible #19). */
export class RotateDashboardKeyDto {
  /**
   * Owner password for forced reauth. Optional here when supplied via
   * `X-Confirm-Password` header instead.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}
