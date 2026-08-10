import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CreateModifierGroupDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSelect?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) maxSelect?: number;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class CreateModifierDto {
  @IsString() groupId!: string;
  @IsString() name!: string;
  @IsOptional() @Type(() => Number) @IsInt() priceDeltaMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class CreateVariantDto {
  @IsString() menuItemId!: string;
  @IsString() name!: string;
  @IsOptional() @Type(() => Number) @IsInt() priceDeltaMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class LinkModifierGroupDto {
  @IsString() menuItemId!: string;
  @IsString() modifierGroupId!: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class UpsertCommerceProfileDto {
  @IsString() menuItemId!: string;
  @IsOptional() @IsString() taxCategoryKey?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) taxRateBps?: number;
  @IsOptional() @IsString() prepRouteKey?: string;
  @IsOptional() @IsString() recipeKey?: string;
}
export class OrderLineInputDto {
  @IsString() menuItemId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modifierIds?: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(999) quantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) seat?: number;
}
export class CreateVenueOrderDto {
  @IsIn(['QUICK_SALE','GUEST_CHECK','DINING','PLAY_SESSION','TAKEAWAY','PREORDER','EVENT']) serviceMode!: string;
  @IsOptional() @IsString() guestCheckId?: string;
  @IsOptional() @IsString() operationsSessionId?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) seat?: number;
  @IsOptional() @IsString() guestLabel?: string;
  @ValidateNested({ each: true }) @Type(() => OrderLineInputDto) @IsArray() @ArrayMinSize(1) lines!: OrderLineInputDto[];
}
export class CancelOrderLineDto { @IsString() reason!: string; }
