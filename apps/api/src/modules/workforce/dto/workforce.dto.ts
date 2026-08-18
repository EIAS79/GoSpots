import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateJobRoleDto { @IsString() name!:string; @IsOptional() @IsString() code?:string; @IsOptional() @Type(()=>Number) @IsInt() sortOrder?:number; }
export class CreateEmployeeRateDto { @IsString() membershipId!:string; @IsString() jobRoleId!:string; @Type(()=>Number) @IsInt() @Min(0) hourlyRateMinor!:number; @IsOptional() @IsString() currency?:string; @IsDateString() effectiveFrom!:string; @IsOptional() @IsDateString() effectiveTo?:string; }
export class CreateScheduleEntryDto { @IsString() membershipId!:string; @IsString() jobRoleId!:string; @IsDateString() startsAt!:string; @IsDateString() endsAt!:string; @IsOptional() @IsString() note?:string; }
export class ClockInDto {
  @IsOptional() @IsString() jobRoleId?:string;
  @IsOptional() @IsString() scheduleEntryId?:string;
  @IsOptional() @IsString() deviceId?:string;
  @IsOptional() @Type(()=>Number) @IsNumber() @Min(-90) @Max(90) latitude?:number;
  @IsOptional() @Type(()=>Number) @IsNumber() @Min(-180) @Max(180) longitude?:number;
}
export class StartBreakDto { @IsOptional() @IsBoolean() paid?:boolean; @IsOptional() @IsString() note?:string; }
export class CreateTimeAdjustmentDto { @IsString() timePunchId!:string; @IsOptional() @IsDateString() proposedStartedAt?:string; @IsOptional() @IsDateString() proposedEndedAt?:string; @IsOptional() @Type(()=>Number) @IsInt() @Min(0) @Max(86400) proposedUnpaidBreakSeconds?:number; @IsString() reason!:string; }
export class DecideTimeAdjustmentDto { @IsBoolean() approve!:boolean; @IsOptional() @IsString() note?:string; }