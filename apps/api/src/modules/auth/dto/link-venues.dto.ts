import { ArrayMinSize, IsArray, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LinkVenuesPreviewDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class LinkVenuesDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  shopIds!: string[];
}
