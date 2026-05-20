import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

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
  @Matches(/^[a-z0-9-]+$/i, { message: "Slug must be alphanumeric/dash." })
  shopSlug!: string;

  @IsString()
  @MaxLength(120)
  shopName!: string;
}

export class LoginDto {
  /** Owner: real email · Staff: username@venue-slug.venueflow */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  login!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
