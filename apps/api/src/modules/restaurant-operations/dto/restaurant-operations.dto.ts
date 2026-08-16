import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MenuServiceModePolicyDto {
  @IsString() menuItemId!: string;
  @IsIn(['DINE_IN', 'TAKEAWAY', 'BAR', 'QR_TABLE']) serviceMode!: string;
  @IsBoolean() enabled!: boolean;
}

export class MenuPresentationDto {
  @IsString() menuItemId!: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() kitchenName?: string;
  @IsOptional() @IsDateString() expectedRestockAt?: string;
}

export class ModifierAvailabilityDto {
  @IsString() modifierId!: string;
  @IsBoolean() available!: boolean;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsDateString() expectedRestockAt?: string;
}

export class BootstrapRestaurantOrderDto {
  @IsOptional() @IsIn(['STAFF', 'CASHIER', 'QR_TABLE']) origin?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440) prepQuoteMinutes?: number;
}

export class RestaurantLifecycleDto {
  @IsIn(['DRAFT', 'PLACED', 'ACKNOWLEDGED', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED', 'CLOSED']) lifecycle!: string;
}

export class RestaurantLineOpsDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(99) courseNumber!: number;
  @IsIn(['HOLD', 'FIRE_LATER', 'FIRED']) fireState!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) priority?: number;
  @IsOptional() @IsBoolean() rush?: boolean;
}

export class FireCourseDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(99) courseNumber!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) lineIds?: string[];
}

export class TableTransferDto {
  @IsOptional() @IsString() toResourceId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) lineIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) fromSeat?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) toSeat?: number;
  @IsOptional() @IsString() reason?: string;
}

export class CombineTablesDto {
  @IsString() sourceOrderId!: string;
  @IsString() targetOrderId!: string;
  @IsOptional() @IsString() reason?: string;
}

export class BarTabDto {
  @IsString() name!: string;
  @IsOptional() @IsString() preauthOperationId?: string;
}

export class PickupStatusDto {
  @IsIn(['PREPARING', 'READY_FOR_PICKUP', 'COLLECTED']) status!: string;
}

export class PrepTicketControlDto {
  @IsOptional() @IsBoolean() acknowledge?: boolean;
  @IsOptional() @IsBoolean() recall?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) priority?: number;
  @IsOptional() @IsBoolean() rush?: boolean;
  @IsOptional() @IsBoolean() held?: boolean;
}

export class PrepStationGroupDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() expo?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) stationIds!: string[];
}

export class PrepStationTimerPolicyDto {
  @IsString() stationId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(499) warningPct!: number;
  @Type(() => Number) @IsInt() @Min(2) @Max(500) overduePct!: number;
}

export class PrinterRouteDto {
  @IsString() stationId!: string;
  @IsString() printerKey!: string;
  @IsOptional() @IsString() fallbackPrinterKey?: string;
}

export class PrinterJobResultDto {
  @IsBoolean() success!: boolean;
  @IsOptional() @IsString() error?: string;
}

export class QrTableTokenDto {
  @IsString() resourceId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10080) ttlMinutes!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) maxUses?: number;
}

export class QrOrderLineDto {
  @IsString() menuItemId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modifierIds?: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(99) quantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) seat?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) courseNumber?: number;
}

export class QrTableOrderDto {
  @IsOptional() @IsString() guestLabel?: string;
  @ValidateNested({ each: true })
  @Type(() => QrOrderLineDto)
  @IsArray()
  @ArrayMinSize(1)
  lines!: QrOrderLineDto[];
}

export class AppendRestaurantOrderDto {
  @ValidateNested({ each: true })
  @Type(() => QrOrderLineDto)
  @IsArray()
  @ArrayMinSize(1)
  lines!: QrOrderLineDto[];
}
