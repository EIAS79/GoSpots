import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
export class InventoryProfileDto { @IsBoolean() enabled!:boolean; @IsOptional() @IsBoolean() legacyDualMode?:boolean; }
export class CreateLocationDto { @IsString() name!:string; }
export class CreateStockItemDto { @IsString() name!:string; @IsOptional() @IsString() sku?:string; @IsOptional() @IsString() categoryId?:string; @IsOptional() @IsString() unit?:string; }
export class CreateSupplierDto { @IsString() name!:string; @IsOptional() @IsString() email?:string; @IsOptional() @IsString() phone?:string; }
export class RecipeComponentDto { @IsString() stockItemId!:string; @Type(()=>Number) @IsInt() @Min(1) quantityMilli!:number; }
export class CreateRecipeDto { @IsString() key!:string; @IsString() name!:string; @IsOptional() @IsString() menuItemId?:string; @IsOptional() @Type(()=>Number) @IsInt() @Min(1) yieldMilli?:number; @ValidateNested({each:true}) @Type(()=>RecipeComponentDto) @IsArray() @ArrayMinSize(1) components!:RecipeComponentDto[]; }
export class StockMovementDto { @IsString() stockItemId!:string; @IsString() locationId!:string; @Type(()=>Number) @IsInt() quantityMilli!:number; @IsString() note!:string; }
export class PurchaseOrderLineDto { @IsString() stockItemId!:string; @Type(()=>Number) @IsInt() @Min(1) orderedMilli!:number; @Type(()=>Number) @IsInt() @Min(0) unitCostMinor!:number; }
export class CreatePurchaseOrderDto { @IsString() supplierId!:string; @IsString() locationId!:string; @ValidateNested({each:true}) @Type(()=>PurchaseOrderLineDto) @IsArray() @ArrayMinSize(1) lines!:PurchaseOrderLineDto[]; }
export class ReceiptLineDto { @IsString() stockItemId!:string; @Type(()=>Number) @IsInt() @Min(1) quantityMilli!:number; @Type(()=>Number) @IsInt() @Min(0) unitCostMinor!:number; }
export class ReceiveDto { @IsString() locationId!:string; @IsOptional() @IsString() supplierId?:string; @ValidateNested({each:true}) @Type(()=>ReceiptLineDto) @IsArray() @ArrayMinSize(1) lines!:ReceiptLineDto[]; }
export class StocktakeLineDto { @IsString() stockItemId!:string; @Type(()=>Number) @IsInt() @Min(0) countedMilli!:number; }
export class PostStocktakeDto { @IsString() locationId!:string; @ValidateNested({each:true}) @Type(()=>StocktakeLineDto) @IsArray() @ArrayMinSize(1) lines!:StocktakeLineDto[]; }
export class TransferDto { @IsString() stockItemId!:string; @IsString() fromLocationId!:string; @IsString() toLocationId!:string; @Type(()=>Number) @IsInt() @Min(1) quantityMilli!:number; }
export class ReverseConsumptionDto { @IsString() reason!:string; }
export class CreateLegacyInventoryMappingDto { @IsString() menuItemId!:string; @IsString() stockItemId!:string; @IsOptional() @IsString() locationId?:string; @IsOptional() @IsBoolean() seedOpeningBalance?:boolean; }
