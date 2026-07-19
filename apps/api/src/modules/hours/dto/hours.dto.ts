import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WeeklyDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsBoolean()
  isClosed!: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opensAt?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closesAt?: string;
}

export class PutWeeklyHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyDayDto)
  days!: WeeklyDayDto[];
}

export class CreateScheduleExceptionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsBoolean()
  isClosed!: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opensAt?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closesAt?: string;
}

export class UpdateScheduleExceptionDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opensAt?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closesAt?: string | null;
}
