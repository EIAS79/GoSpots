import { DeviceStatus, DeviceType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsEnum(DeviceType)
  type!: DeviceType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalTerminalId?: string;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  softwareVersion?: string;
}

export class UpdateDeviceDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalTerminalId?: string;

  @IsOptional()
  @IsBoolean()
  terminalEnabled?: boolean;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  softwareVersion?: string | null;
}

export class ClaimDeviceDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
