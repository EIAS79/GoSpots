import {
  ConnectorInstallationStatus,
  IntegrationDirection,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateConnectorInstallationDto {
  @IsString()
  @Length(2, 40)
  provider!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, unknown>;
}

export class UpdateConnectorInstallationDto {
  @IsOptional()
  @IsEnum(ConnectorInstallationStatus)
  status?: ConnectorInstallationStatus;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, unknown>;
}

export class CreateIntegrationJobDto {
  @IsString()
  @Length(2, 100)
  jobType!: string;

  @IsString()
  @Length(8, 160)
  idempotencyKey!: string;

  @IsEnum(IntegrationDirection)
  direction!: IntegrationDirection;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;
}

export class CreateIntegrationCredentialDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateWebhookEndpointDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  eventTypes!: string[];
}

export class UpsertIntegrationMappingDto {
  @IsString()
  @Length(1, 80)
  mappingType!: string;

  @IsString()
  @Length(1, 160)
  localKey!: string;

  @IsString()
  @Length(1, 160)
  externalKey!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
