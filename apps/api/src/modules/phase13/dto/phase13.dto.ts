import { DataImportKind, SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOrganizationInventoryTransferDto {
  @IsString() @MinLength(1) sourceShopId!: string;
  @IsString() @MinLength(1) destinationShopId!: string;
  @IsString() @MinLength(1) sourceStockItemId!: string;
  @IsString() @MinLength(1) destinationStockItemId!: string;
  @IsString() @MinLength(1) sourceLocationId!: string;
  @IsString() @MinLength(1) destinationLocationId!: string;
  @IsInt() @Min(1) quantityMilli!: number;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReceiveOrganizationInventoryTransferDto {
  @IsInt() @Min(0) receivedMilli!: number;
  @IsInt() @Min(0) damagedMilli!: number;
  @IsInt() @Min(0) missingMilli!: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
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
  enabled!: boolean;
}

export class RotateWebhookSecretDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
