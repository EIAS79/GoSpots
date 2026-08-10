import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class OpenCashSessionDto {
  @IsString()
  @MaxLength(64)
  openingFloat!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  drawerId?: string;
}

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsString()
  @MaxLength(64)
  amount!: string;

  @IsString()
  @MaxLength(64)
  reasonCategory!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SubmitCashCountDto {
  @IsString()
  @MaxLength(64)
  countedAmount!: string;
}

export class CloseCashSessionDto {
  @IsString()
  @MaxLength(128)
  cashCountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ApproveCashVarianceDto {
  @IsString()
  @MaxLength(128)
  cashCountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateCashPolicyDto {
  @IsOptional()
  @IsBoolean()
  cashSessionRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  cashBlindCountEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cashVarianceApprovalThreshold?: string;
}

export class CashReportsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
