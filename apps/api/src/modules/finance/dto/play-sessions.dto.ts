import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod, PlaySessionStatus } from '@prisma/client';

export class CreatePlaySessionDto {
  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  reservationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  playerCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdatePlaySessionDto {
  @IsOptional()
  @IsEnum(PlaySessionStatus)
  status?: PlaySessionStatus;

  @IsOptional()
  @IsString()
  resourceId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  playerCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /** End an active walk-in (moves to awaiting payment). */
  @IsOptional()
  @IsBoolean()
  endSession?: boolean;

  /** Undo paid — reopen for payment. */
  @IsOptional()
  @IsBoolean()
  clearPaid?: boolean;
}
