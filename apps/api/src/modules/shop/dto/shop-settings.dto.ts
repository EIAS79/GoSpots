import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from "../../../common/locale-currency";

const LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code);
const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

export class UpdateShopSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn([...LOCALE_CODES])
  locale?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CURRENCY_CODES])
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

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
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  /** Building levels for dining seating (1–10). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  floorCount?: number;
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
