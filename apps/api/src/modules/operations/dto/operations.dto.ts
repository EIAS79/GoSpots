import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateOperationsRatePlanDto {
  @IsString() name!: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() resourceCategoryId?: string;
  @Type(() => Number) @IsInt() @Min(0) hourlyRateMinor!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeRateMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) overtimeAfterMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) roundingMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimumMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capMinor?: number;
  @IsOptional() @IsString() membershipHookKey?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class StartOperationsSessionDto {
  @IsString() resourceId!: string;
  @IsOptional() @IsString() ratePlanId?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() guestCheckId?: string;
  @IsOptional() @IsString() reservationId?: string;
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
