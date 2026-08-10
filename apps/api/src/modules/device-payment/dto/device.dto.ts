import { DeviceStatus, DeviceType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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
}

export class UpdateDeviceDto {
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
}
