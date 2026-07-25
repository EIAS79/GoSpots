import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StaffActionKind } from '@prisma/client';

const FINITE_MONEY = { allowNaN: false, allowInfinity: false } as const;

export class StaffActionRatePatchDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @IsNumber(FINITE_MONEY)
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class StaffActionPatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsNumber(FINITE_MONEY)
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber(FINITE_MONEY)
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => StaffActionRatePatchDto)
  rates?: StaffActionRatePatchDto[];
}

export class CreateStaffActionRequestDto {
  @IsEnum(StaffActionKind)
  kind!: StaffActionKind;

  @IsString()
  @MaxLength(64)
  targetId!: string;

  @ValidateNested()
  @Type(() => StaffActionPatchDto)
  patch!: StaffActionPatchDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolveStaffActionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolveNote?: string;
}

/** Manager standing at staff device — one-time approve with their login. */
export class ApproveWithManagerDto {
  @IsString()
  @MaxLength(320)
  managerEmail!: string;

  @IsString()
  @MaxLength(200)
  managerPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolveNote?: string;
}
