import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VENUE_ADD_ONS, VENUE_PACKS } from '../../../common/venue-packs';

const PACK_IDS = Object.keys(VENUE_PACKS);
const ADD_ON_IDS = Object.keys(VENUE_ADD_ONS);

export class RegisterDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(10, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/i, { message: 'Slug must be alphanumeric/dash.' })
  shopSlug!: string;

  @IsString()
  @MaxLength(120)
  shopName!: string;

  @IsOptional()
  @IsString()
  @IsIn([...PACK_IDS])
  packId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsIn([...ADD_ON_IDS], { each: true })
  addOns?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  venueType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class LoginDto {
  /** Owner: real email · Staff: username@venue-slug.gospots */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  login!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  /** When set, login must match this account type (UI owner/employee switch). */
  @IsOptional()
  @IsIn(['VENUE_OWNER', 'VENUE_STAFF'])
  accountType?: 'VENUE_OWNER' | 'VENUE_STAFF';
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @IsString()
  @Length(10, 128)
  password!: string;
}

/** Staff asks the venue owner for a new setup / password link. */
export class StaffForgotPasswordDto {
  /** Venue name or owner display name (must match the shop). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  venueName!: string;

  /** Staff login ID, e.g. anna@venue.gospots */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  loginId!: string;
}

/** Owner MFA enroll begin — recent password confirmation. */
export class MfaTotpBeginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

/** Confirm TOTP enroll + issue recovery codes once. */
export class MfaTotpConfirmDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be 6 digits.' })
  code!: string;
}

/** Disable MFA — password + TOTP or recovery code. */
export class MfaTotpDisableDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be 6 digits.' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

/** Regenerate recovery codes — password + TOTP or remaining recovery code. */
export class MfaRecoveryRegenerateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be 6 digits.' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

/** Complete MFA login challenge (does not set cookies until success). */
export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  mfaToken!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be 6 digits.' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

export class UpdateVenuePackDto {
  @IsOptional()
  @IsString()
  @IsIn([...PACK_IDS])
  packId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsIn([...ADD_ON_IDS], { each: true })
  addOns?: string[];

  /** Purchased employee seats (0–100). Required when team_accounts is selected. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  staffSeatQuantity?: number;
}
