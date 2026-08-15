import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  OperationsBillingMode,
  OperationsMoveRatePolicy,
  OperationsPauseBillingMode,
} from '@prisma/client';
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
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() membershipId?: string;
  @IsOptional() @IsString() packageId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() allowReserved?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) participantCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) gameCount?: number;
}

export class ExpectedOperationsSessionVersionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class PauseOperationsSessionDto extends ExpectedOperationsSessionVersionDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason!: string;
}

export class MoveOperationsSessionDto extends ExpectedOperationsSessionVersionDto {
  @IsString() resourceId!: string;
  @IsOptional() @IsBoolean() allowReserved?: boolean;
}

export class ExtendOperationsSessionDto extends ExpectedOperationsSessionVersionDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) minutes!: number;
}

export class CancelOperationsSessionDto extends ExpectedOperationsSessionVersionDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class AttachGuestCheckDto extends ExpectedOperationsSessionVersionDto {
  @IsString() guestCheckId!: string;
}

export class CreateMaintenanceDto {
  @IsString() resourceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) reason!: string;
  @IsOptional() @IsDateString() expectedReturnAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateSessionGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() guestCheckId?: string;
}

export class UpdateOperationsPolicyDto {
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsEnum(OperationsPauseBillingMode) pauseBillingMode?: OperationsPauseBillingMode;
  @IsOptional() @IsBoolean() managerOnlyPause?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) maxPauseMinutes?: number;
  @IsOptional() @IsEnum(OperationsMoveRatePolicy) moveRatePolicy?: OperationsMoveRatePolicy;
  @IsOptional() @IsBoolean() fixedSessionAutoExtend?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsInt({ each: true }) @Min(1, { each: true }) @Max(1440, { each: true }) fixedSessionWarningMinutes?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) defaultExtensionMinutes?: number;
}

export class CreateOperationsWaitlistDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) partySize!: number;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() @MaxLength(80) requestedResourceType?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) desiredDurationMinutes!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440) estimatedWaitMinutes?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class OperationsWaitlistActionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class SeatOperationsWaitlistDto extends OperationsWaitlistActionDto {
  @IsString() resourceId!: string;
  @IsOptional() @IsString() ratePlanId?: string;
  @IsOptional() @IsString() packageId?: string;
  @IsOptional() @IsBoolean() allowReserved?: boolean;
}
