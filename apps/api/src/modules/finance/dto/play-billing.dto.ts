import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export const PLAY_BILLING_TABS = [
  'in_progress',
  'awaiting_payment',
  'paid',
  'all',
] as const;
export type PlayBillingTabDto = (typeof PLAY_BILLING_TABS)[number];

export class PlayBillingQueryDto {
  @IsOptional()
  @IsIn([...PLAY_BILLING_TABS])
  tab?: PlayBillingTabDto;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  take?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class MarkPlayBillingPaidDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountOverride?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

export class UpdatePlayBillingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  guestName?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  /** Staff-set base charge before discount. Pass null to revert to Gaming setup rates. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAmount?: number | null;

  /** @deprecated Use baseAmount */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountOverride?: number | null;

  /** Staff discount 0–100 before payment. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  /** Move a paid row back to awaiting payment. */
  @IsOptional()
  @IsBoolean()
  clearPaid?: boolean;
}

export const PLAY_BILLING_CANCEL_REASONS = ['NO_SHOW', 'CANCELED'] as const;
export type PlayBillingCancelReasonDto =
  (typeof PLAY_BILLING_CANCEL_REASONS)[number];

export class CancelPlayBillingDto {
  @IsOptional()
  @IsIn([...PLAY_BILLING_CANCEL_REASONS])
  reason?: PlayBillingCancelReasonDto;
}
