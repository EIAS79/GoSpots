import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const SEATING_ZONE_VALUES = ['INDOOR', 'OUTDOOR'] as const;
export type SeatingZoneDto = (typeof SEATING_ZONE_VALUES)[number];

export class CreateSeatingTableGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsInt()
  @Min(0)
  totalCount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @IsIn(SEATING_ZONE_VALUES)
  zone?: SeatingZoneDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;

  @IsOptional()
  @IsDateString()
  eventStartsAt?: string;

  @IsOptional()
  @IsDateString()
  eventEndsAt?: string;
}

export class UpdateSeatingTableGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(SEATING_ZONE_VALUES)
  zone?: SeatingZoneDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;

  @IsOptional()
  @IsDateString()
  eventStartsAt?: string | null;

  @IsOptional()
  @IsDateString()
  eventEndsAt?: string | null;
}
