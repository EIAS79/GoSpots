import { ReservationStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ReservationQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;
}

/** Public + staff day schedule — calendar date only (not full ISO datetime). */
export class ScheduleQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryId?: string;
}

export class CreateReservationDto {
  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  partySize?: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  staffAlert?: boolean;
}

export class UpdateReservationDto {
  @IsOptional()
  @IsString()
  resourceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string;

  @IsOptional()
  @IsEmail()
  guestEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  partySize?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  billedAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  staffAlert?: boolean;
}
