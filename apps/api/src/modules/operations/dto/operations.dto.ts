import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OperationsBillingMode } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';

export class CreateOperationsRatePlanDto {
  @IsString() name!: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() resourceCategoryId?: string;
  @IsOptional() @IsEnum(OperationsBillingMode) billingMode?: OperationsBillingMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) hourlyRateMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) unitPriceMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeRateMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) overtimeAfterMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) roundingMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimumMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) fixedDurationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimumChargeMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) graceMinutes?: number;
  @IsOptional() @IsString() membershipHookKey?: string;
  @IsOptional() @IsBoolean() membershipOnly?: boolean;
  @IsOptional() @IsBoolean() happyHour?: boolean;
  @IsOptional() @IsBoolean() groupPackage?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1439) startMinute?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1439) endMinute?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(366) @IsString({ each: true }) holidayDates?: string[];
  @IsOptional() @Type(() => Number) @IsInt() priority?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateOperationsRatePlanDto extends PartialType(CreateOperationsRatePlanDto) {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class StartOperationsSessionDto {
  @IsString() resourceId!: string;
  @IsOptional() @IsString() ratePlanId?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() guestCheckId?: string;
  @IsOptional() @IsString() reservationId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) participantCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) gameCount?: number;
}

export class ExpectedOperationsSessionVersionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class PauseOperationsSessionDto extends ExpectedOperationsSessionVersionDto {
  @IsOptional() @IsString() reason?: string;
}

export class MoveOperationsSessionDto extends ExpectedOperationsSessionVersionDto {
  @IsString() resourceId!: string;
}

export class AttachGuestCheckDto extends ExpectedOperationsSessionVersionDto {
  @IsString() guestCheckId!: string;
}

export class CreateMaintenanceDto {
  @IsString() resourceId!: string;
  @IsString() reason!: string;
}

export class CreateSessionGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() guestCheckId?: string;
}
