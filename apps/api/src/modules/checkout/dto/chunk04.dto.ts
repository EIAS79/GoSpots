import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import {
  CheckoutPaymentMethod,
  PaymentAllocationKind,
} from '@prisma/client';

const MONEY_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export class PreviewPaymentGroupsDto {
  @IsEnum(PaymentAllocationKind)
  mode!: PaymentAllocationKind;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  parts?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Matches(MONEY_PATTERN, { each: true })
  customAmounts?: string[];
}

export class CheckoutPaymentAllocationDto {
  @IsString()
  @MaxLength(128)
  snapshotId!: string;

  @Matches(MONEY_PATTERN)
  amount!: string;
}

export class CreateCheckoutPaymentDto {
  @IsInt()
  @Min(1)
  expectedCheckVersion!: number;

  @IsEnum(CheckoutPaymentMethod)
  method!: CheckoutPaymentMethod;

  @IsEnum(PaymentAllocationKind)
  allocationKind!: PaymentAllocationKind;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentAllocationDto)
  allocations!: CheckoutPaymentAllocationDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MergeGuestChecksDto {
  @IsString()
  @MaxLength(128)
  sourceCheckId!: string;

  @IsInt()
  @Min(1)
  expectedDestinationVersion!: number;

  @IsInt()
  @Min(1)
  expectedSourceVersion!: number;
}

export class MoveGuestCheckChargesDto {
  @IsString()
  @MaxLength(128)
  destinationCheckId!: string;

  @IsInt()
  @Min(1)
  expectedSourceVersion!: number;

  @IsInt()
  @Min(1)
  expectedDestinationVersion!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shopOrderIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playSessionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reservationIds?: string[];
}
