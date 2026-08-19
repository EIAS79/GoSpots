import { DataImportKind, SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrganizationInventoryTransferDto {
  @IsString() @MinLength(1) sourceShopId!: string;
  @IsString() @MinLength(1) destinationShopId!: string;
  @IsString() @MinLength(1) sourceStockItemId!: string;
  @IsString() @MinLength(1) destinationStockItemId!: string;
  @IsString() @MinLength(1) sourceLocationId!: string;
  @IsString() @MinLength(1) destinationLocationId!: string;
  @IsInt() @Min(1) quantityMilli!: number;
  @IsString() @MinLength(8) @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReceiveOrganizationInventoryTransferDto {
  @IsInt() @Min(0) receivedMilli!: number;
  @IsInt() @Min(0) damagedMilli!: number;
  @IsInt() @Min(0) missingMilli!: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CentralPurchaseOrderLineDto {
  @IsString() @MinLength(1) stockItemId!: string;
  @IsInt() @Min(1) orderedMilli!: number;
  @IsInt() @Min(0) unitCostMinor!: number;
}

export class CreateCentralPurchaseOrderDto {
  @IsString() @MinLength(1) destinationShopId!: string;
  @IsString() @MinLength(1) supplierId!: string;
  @IsString() @MinLength(1) locationId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CentralPurchaseOrderLineDto)
  lines!: CentralPurchaseOrderLineDto[];
  @IsString() @MinLength(8) @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(500) documentRef?: string;
}

export class ImportPreviewDto {
  @IsEnum(DataImportKind) kind!: DataImportKind;
  @IsString() @MinLength(1) @MaxLength(1_500_000) csv!: string;
}

export class SystemSubscriptionUpdateDto {
  @IsOptional() @IsEnum(SubscriptionTier) tier?: SubscriptionTier;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
  @IsOptional() @IsString() @MaxLength(80) packId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) staffSeatQuantity?: number;
  @IsOptional() @IsString() trialEndsAt?: string | null;
  @IsOptional() @IsString() currentPeriodEnd?: string | null;
}

export class SystemFeatureFlagUpdateDto {
  @IsString() @MinLength(1) @MaxLength(120) key!: string;
  @IsBoolean() enabled!: boolean;
}

export class RotateWebhookSecretDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
