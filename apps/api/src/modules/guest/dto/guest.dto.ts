import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePublicReviewDto {
  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsBoolean()
  privacyConsentAccepted!: boolean;

  /** Optional CAPTCHA token (Turnstile/hCaptcha). Required only when provider+mode enforce. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

export class UpdateReviewStatusDto {
  @IsIn(['PENDING', 'PUBLISHED', 'REJECTED'])
  status!: 'PENDING' | 'PUBLISHED' | 'REJECTED';
}

export class CreatePublicContactDto {
  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsBoolean()
  privacyConsentAccepted!: boolean;

  /** Optional CAPTCHA token (Turnstile/hCaptcha). Required only when provider+mode enforce. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

export class CreatePublicGuestChatDto {
  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsBoolean()
  privacyConsentAccepted!: boolean;

  /** Optional CAPTCHA token (Turnstile/hCaptcha). Required only when provider+mode enforce. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

export class GuestChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}
