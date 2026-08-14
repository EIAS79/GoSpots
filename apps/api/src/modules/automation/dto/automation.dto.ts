import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateAutomationRuleDto {
  @IsString() @MaxLength(120) name!: string;
  @IsIn(['MANUAL', 'DOMAIN_EVENT', 'SCHEDULED']) triggerType!: 'MANUAL' | 'DOMAIN_EVENT' | 'SCHEDULED';
  @IsOptional() @IsObject() triggerConfig?: Record<string, unknown>;
  @IsOptional() @IsObject() condition?: Record<string, unknown>;
  @IsArray() actions!: Record<string, unknown>[];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() nextRunAt?: string;
}

export class UpdateAutomationRuleDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() triggerConfig?: Record<string, unknown>;
  @IsOptional() @IsObject() condition?: Record<string, unknown>;
  @IsOptional() @IsArray() actions?: Record<string, unknown>[];
  @IsOptional() @IsString() nextRunAt?: string | null;
}

export class TriggerAutomationDto {
  @IsString() @MaxLength(180) dedupeKey!: string;
  @IsOptional() @IsString() @MaxLength(180) triggerRef?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class ReplayDeadLetterDto {
  @IsOptional() @IsString() @MaxLength(180) reason?: string;
}
