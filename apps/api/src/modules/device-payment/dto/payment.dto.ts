import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StartProviderPaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  settlementId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  terminalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RefundAllocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  paymentAllocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  snapshotId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  amount!: string;
}

export class CreateProviderRefundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundAllocationDto)
  allocations!: RefundAllocationDto[];
}
