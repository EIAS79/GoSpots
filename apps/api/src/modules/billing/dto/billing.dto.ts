import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const BILLING_PROVIDERS = ['STRIPE', 'MOLLIE'] as const;
export type BillingProviderDto = (typeof BILLING_PROVIDERS)[number];

export const BILLING_RENEWAL_MODES = [
  'AUTOMATIC_RENEWAL',
  'MANUAL_MONTHLY',
] as const;
export type BillingRenewalModeDto = (typeof BILLING_RENEWAL_MODES)[number];

export const BILLING_CANCEL_TIMINGS = ['IMMEDIATE', 'PERIOD_END'] as const;
export type BillingCancelTimingDto = (typeof BILLING_CANCEL_TIMINGS)[number];

/**
 * Dual-provider checkout body. Fields are optional at the pipe layer so the
 * legacy Lemon `POST /billing/checkout` (empty body) still validates when
 * BILLING_ENABLED is off; the orchestrator enforces required fields.
 */
export class CheckoutDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  packId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  addOnIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  seatQuantity?: number;

  @IsOptional()
  @IsIn([...BILLING_PROVIDERS])
  provider?: BillingProviderDto;

  @IsOptional()
  @IsIn([...BILLING_RENEWAL_MODES])
  renewalMode?: BillingRenewalModeDto;

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  trialDays?: number;

  /** Required when renewalMode is AUTOMATIC_RENEWAL (enforced in orchestrator). */
  @IsOptional()
  @IsBoolean()
  autoRenewConsent?: boolean;
}

export class CancelDto {
  @IsIn([...BILLING_CANCEL_TIMINGS])
  timing!: BillingCancelTimingDto;
}

export class PauseDto {
  /** Optional ISO date when the pause should auto-resume (advisory). */
  @IsOptional()
  @IsString()
  resumeAt?: string;
}

export class ChangePlanDto {
  @IsString()
  @MinLength(1)
  packId!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  addOnIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  seatQuantity?: number;
}

export class ChangeRenewalModeDto {
  @IsIn([...BILLING_RENEWAL_MODES])
  renewalMode!: BillingRenewalModeDto;

  @ValidateIf(
    (o: ChangeRenewalModeDto) => o.renewalMode === 'AUTOMATIC_RENEWAL',
  )
  @IsBoolean()
  autoRenewConsent?: boolean;
}

export class SwitchProviderDto {
  @IsIn([...BILLING_PROVIDERS])
  provider!: BillingProviderDto;

  @IsOptional()
  @IsIn([...BILLING_RENEWAL_MODES])
  renewalMode?: BillingRenewalModeDto;

  @ValidateIf(
    (o: SwitchProviderDto) => o.renewalMode === 'AUTOMATIC_RENEWAL',
  )
  @IsBoolean()
  autoRenewConsent?: boolean;
}
