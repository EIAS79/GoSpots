import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
export class CreatePrepStationDto { @IsString() name!:string; @IsIn(['KITCHEN','BAR','DESSERT','OTHER']) kind!:string; @IsOptional() @Type(()=>Number) @IsInt() @Min(30) targetSeconds?:number; @IsOptional() @Type(()=>Number) @IsInt() sortOrder?:number; }
export class CreatePrepRouteDto { @IsString() key!:string; @IsString() stationId!:string; @IsOptional() @IsString() menuItemId?:string; @IsOptional() @Type(()=>Number) @IsInt() priority?:number; }
export class PrepStatusDto { @IsIn(['NEW','PREPARING','READY','COLLECTED','CANCELED']) status!:string; @IsOptional() @IsString() reason?:string; }
