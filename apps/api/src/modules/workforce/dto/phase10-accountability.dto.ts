import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PHASE10_ACTION_KINDS } from '../phase10.rules';

export class UpdateStaffEmploymentProfileDto {
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(40) employeeNumber?: string;
  @IsOptional() @IsString() primaryJobRoleId?: string | null;
  @IsOptional() @IsString() managerMembershipId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SetOperatorCredentialDto {
  @IsString() membershipId!: string;
  @IsString() @Matches(/^\d{4,8}$/) pin!: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(128) badge?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SwitchOperatorDto {
  @IsString() membershipId!: string;
  @IsOptional() @IsString() @Matches(/^\d{4,8}$/) pin?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(128) badge?: string;
  @IsOptional() @IsString() @MaxLength(120) workstation?: string;
}

export class UpdateApprovalPolicyDto {
  @IsString() @IsIn(PHASE10_ACTION_KINDS) actionKind!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) amountThresholdMinor?: number | null;
  @IsOptional() @IsBoolean() requirePassword?: boolean;
  @IsOptional() @IsBoolean() notifyOnUse?: boolean;
}

export class CreateApprovalRequestV2Dto {
  @IsString() @IsIn(PHASE10_ACTION_KINDS) actionKind!: string;
  @IsString() @MaxLength(80) sourceType!: string;
  @IsOptional() @IsString() @MaxLength(160) sourceId?: string;
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class DecideApprovalRequestV2Dto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(128) password?: string;
}

export class UpdateStaffNotificationRuleDto {
  @IsString() @IsIn(PHASE10_ACTION_KINDS) actionKind!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) amountThresholdMinor?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10080) repeatWindowMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) repeatCountThreshold?: number;
  @IsOptional() @IsInt() @Min(0) @Max(23) afterHoursStartHour?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(23) afterHoursEndHour?: number | null;
}

export class UpdateWorkforcePolicyDto {
  @IsOptional() @IsBoolean() enforceSchedule?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(240) earlyClockInMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(240) lateGraceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(604800) overtimeWeeklySeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(86400) minimumBreakAfterSeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(21600) minimumBreakSeconds?: number;
  @IsOptional() @IsInt() @Min(1) @Max(480) operatorSessionMinutes?: number;
  @IsOptional() @IsInt() @Min(2) @Max(20) pinLockoutAttempts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) pinLockoutMinutes?: number;
  @IsOptional() @IsBoolean() clockInDeviceRequired?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) clockInAllowedDeviceIds?: string[];
  @IsOptional() @IsBoolean() clockInLocationRequired?: boolean;
  @IsOptional() @Type(()=>Number) @IsNumber() @Min(-90) @Max(90) clockInLatitude?: number | null;
  @IsOptional() @Type(()=>Number) @IsNumber() @Min(-180) @Max(180) clockInLongitude?: number | null;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(10) @Max(100000) clockInRadiusMeters?: number;
}

export class CreateShiftSwapRequestDto {
  @IsString() scheduleEntryId!: string;
  @IsOptional() @IsString() targetMembershipId?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class DecideShiftSwapRequestDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PublishScheduleEntryDto {
  @IsBoolean() published!: boolean;
}

export class MarkScheduleAbsenceDto {
  @IsOptional() @IsIn(['ABSENT', 'EXCUSED', 'NO_SHOW']) status?: string | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}