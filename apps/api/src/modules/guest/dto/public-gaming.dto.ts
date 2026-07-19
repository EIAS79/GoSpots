import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePublicGamingReservationDto {
  @IsString()
  resourceId!: string;

  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsEmail()
  @MaxLength(200)
  guestEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsInt()
  @Min(1)
  partySize!: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
