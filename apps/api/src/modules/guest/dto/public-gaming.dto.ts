import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Public guest booking create (gaming + dining).
 * shopId is never accepted from the body — the published venue slug resolves it.
 */
export class CreatePublicGamingReservationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  resourceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  guestName!: string;

  @IsEmail()
  @MaxLength(200)
  guestEmail!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  guestPhone?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  partySize!: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Guest must accept venue privacy notice (Art. 7 record via ConsentRecord). */
  @IsBoolean()
  privacyConsentAccepted!: boolean;

  /** Optional CAPTCHA token (Turnstile/hCaptcha). Required only when provider+mode enforce. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

/** Same bounds as gaming — used by `POST .../dining/reservations`. */
export class CreatePublicDiningReservationDto extends CreatePublicGamingReservationDto {}
