import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const GDPR_ERASE_ENTITY_TYPES = [
  'reservation',
  'eventRequest',
  'guestChat',
  'contactMessage',
  'venueReview',
] as const;

export type GdprEraseEntityType = (typeof GDPR_ERASE_ENTITY_TYPES)[number];

export class EraseGuestDto {
  @IsIn([...GDPR_ERASE_ENTITY_TYPES])
  entityType!: GdprEraseEntityType;

  @IsString()
  @Length(1, 64)
  entityId!: string;

  /**
   * Owner password for forced reauth. Optional here when supplied via
   * `X-Confirm-Password` header instead.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class EraseGuestByEmailDto {
  @IsEmail()
  @MaxLength(200)
  guestEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export const ERASE_ACCOUNT_CONFIRM_PHRASE = 'DELETE MY ACCOUNT';

export class EraseAccountDto {
  @IsString()
  @MaxLength(128)
  password!: string;

  /** Must equal `DELETE MY ACCOUNT` (case-sensitive). */
  @IsString()
  @MaxLength(64)
  confirmPhrase!: string;
}

export const GUEST_DSAR_TYPES = ['ACCESS', 'ERASURE'] as const;
export type GuestDsarTypeDto = (typeof GUEST_DSAR_TYPES)[number];

export class GuestDsarDto {
  @IsIn([...GUEST_DSAR_TYPES])
  type!: GuestDsarTypeDto;

  @IsEmail()
  @MaxLength(200)
  guestEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  /** Required privacy notice acceptance for the DSAR submission itself. */
  @IsBoolean()
  privacyConsentAccepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

export class CloseGuestDsarDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}
