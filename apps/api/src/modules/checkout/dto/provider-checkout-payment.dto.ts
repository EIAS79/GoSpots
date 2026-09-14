import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentAllocationKind } from '@prisma/client';

const MONEY_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export class ProviderCheckoutAllocationDto {
  @IsString()
  @MaxLength(128)
  snapshotId!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  @MaxLength(40)
  amount!: string;
}

export class CreateProviderCheckoutPaymentDto {
  @IsInt()
  @Min(1)
  expectedCheckVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  terminalId!: string;

  @IsEnum(PaymentAllocationKind)
  allocationKind!: PaymentAllocationKind;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProviderCheckoutAllocationDto)
  allocations!: ProviderCheckoutAllocationDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReconcileProviderCheckoutPaymentDto {
  @IsInt()
  @Min(1)
  expectedCheckVersion!: number;

  @IsEnum(PaymentAllocationKind)
  allocationKind!: PaymentAllocationKind;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProviderCheckoutAllocationDto)
  allocations!: ProviderCheckoutAllocationDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
