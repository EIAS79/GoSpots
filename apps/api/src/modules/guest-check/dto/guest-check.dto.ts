import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGuestCheckDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  partySize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateGuestCheckDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  partySize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AttachGuestCheckDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  shopOrderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  playSessionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reservationId?: string;
}

export class DetachGuestCheckDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  shopOrderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  playSessionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reservationId?: string;
}
