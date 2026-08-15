import {
  CommercialAdjustmentScope,
  CommercialAdjustmentSource,
  CommercialAdjustmentType,
  CommercialChargeMode,
  CommercialCheckType,
  CommercialTipMethod,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCommercialPolicyDto {
  @IsOptional() @IsInt() @Min(0) @Max(10000) maxManualDiscountBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000000) maxCompAmountMinor?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) maxPriceOverrideBps?: number;
  @IsOptional() @IsBoolean() allowCashShiftCloseWithOpenTabs?: boolean;
  @IsOptional() @IsBoolean() allowResourceTransfer?: boolean;
}

export class UpsertCommercialProfileDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsEnum(CommercialCheckType) checkType!: CommercialCheckType;
  @IsOptional() @IsString() @MaxLength(80) assignedOperatorId?: string;
  @IsOptional() @IsString() @MaxLength(80) resourceId?: string;
  @IsOptional() @IsString() @MaxLength(80) operationsSessionId?: string;
  @IsOptional() @IsString() @MaxLength(120) tableReference?: string;
  @IsOptional() @IsString() @MaxLength(80) customerId?: string;
  @IsOptional() @IsString() @MaxLength(120) serviceArea?: string;
}

export class TransferGuestCheckDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(80) assignedOperatorId?: string;
  @IsOptional() @IsString() @MaxLength(80) resourceId?: string;
  @IsOptional() @IsString() @MaxLength(80) operationsSessionId?: string;
  @IsOptional() @IsString() @MaxLength(120) serviceArea?: string;
}

export class ApplyCommercialAdjustmentDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsEnum(CommercialAdjustmentType) type!: CommercialAdjustmentType;
  @IsOptional() @IsEnum(CommercialAdjustmentScope) scope?: CommercialAdjustmentScope;
  @IsOptional() @IsEnum(CommercialAdjustmentSource) source?: CommercialAdjustmentSource;
  @IsOptional() @IsString() @MaxLength(60) targetSourceType?: string;
  @IsOptional() @IsString() @MaxLength(100) targetSourceId?: string;
  @IsOptional() @IsString() @MaxLength(100) targetLineReference?: string;
  /** Fixed discount/comp/deposit amount in minor units. PRICE_OVERRIDE means desired target line total. */
  @IsOptional() @IsInt() @Min(0) @Max(1000000000) amountMinor?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) percentageBps?: number;
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class VoidCommercialMutationDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class AddServiceChargeDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsEnum(CommercialChargeMode) mode!: CommercialChargeMode;
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) amountMinor?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) percentageBps?: number;
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class AddTipDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsEnum(CommercialTipMethod) method!: CommercialTipMethod;
  @IsInt() @Min(1) @Max(1000000000) amountMinor!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReopenGuestCheckDto {
  @IsInt() @Min(1) expectedCheckVersion!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CompleteVenueOrderDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
