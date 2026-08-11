import {
  CustomerDisplayStatus,
  PrintJobStatus,
  PrintJobType,
} from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ConfigurePrinterDto {
  @IsString()
  @Length(1, 120)
  deviceId!: string;

  @IsString()
  @Length(2, 80)
  adapter!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsInt()
  paperWidthMm?: number;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;
}

export class CreatePrintRouteDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEnum(PrintJobType)
  jobType!: PrintJobType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceKey?: string;

  @IsString()
  @Length(1, 120)
  printerDeviceId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;
}

export class CreatePrintJobDto {
  @IsEnum(PrintJobType)
  type!: PrintJobType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceKey?: string;

  @IsString()
  @Length(1, 80)
  sourceType!: string;

  @IsString()
  @Length(1, 160)
  sourceId!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @Length(8, 180)
  dedupeKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fiscalSemanticKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;
}

export class CompletePrintJobDto {
  @IsEnum(PrintJobStatus)
  status!: typeof PrintJobStatus.SUCCEEDED | typeof PrintJobStatus.FAILED;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  errorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  error?: string;
}

export class BindCustomerDisplayDto {
  @IsString()
  @Length(1, 120)
  displayDeviceId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  posDeviceId?: string;
}

export class UpdateCustomerDisplaySnapshotDto {
  @IsEnum(CustomerDisplayStatus)
  status!: CustomerDisplayStatus;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  activeCheckId?: string;

  @IsObject()
  snapshot!: Record<string, unknown>;
}

export class UpsertBarcodeAliasDto {
  @IsString()
  @Length(3, 128)
  barcode!: string;

  @IsString()
  @Length(1, 80)
  entityType!: string;

  @IsString()
  @Length(1, 160)
  entityId!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
