import { OfflinePaymentMinimumRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateOfflinePaymentPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(/^\d+(?:\.\d{1,4})?$/)
  maxSingleAmount!: string;

  @IsString()
  @Matches(/^\d+(?:\.\d{1,4})?$/)
  maxCumulativePendingAmount!: string;

  @IsEnum(OfflinePaymentMinimumRole)
  minimumRole!: OfflinePaymentMinimumRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerWarningText?: string | null;

  @IsInt()
  @Min(1)
  forceReconnectAfterMinutes!: number;
}

export class RunFinancialReconciliationDto {
  @IsISO8601()
  fromInclusive!: string;

  @IsISO8601()
  toExclusive!: string;

  @IsISO8601()
  businessDate!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsString()
  @MaxLength(128)
  correlationId!: string;
}
