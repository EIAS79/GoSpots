import { OrganizationAccessMode, OrganizationRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsObject, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}

export class AddOrganizationShopDto {
  @IsString()
  @Length(1, 120)
  shopId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,23}$/i)
  branchCode?: string;

  @IsOptional()
  @IsBoolean()
  sharedCatalogEnabled?: boolean;

  @IsOptional()
  @IsObject()
  overrideSettings?: Record<string, unknown>;
}

export class AddOrganizationMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrganizationRole)
  role!: OrganizationRole;

  @IsOptional()
  @IsEnum(OrganizationAccessMode)
  accessMode?: OrganizationAccessMode;
}

export class UpdateOrganizationMemberDto {
  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole;

  @IsOptional()
  @IsEnum(OrganizationAccessMode)
  accessMode?: OrganizationAccessMode;
}

export class UpdateOrganizationShopDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,23}$/i)
  branchCode?: string | null;

  @IsOptional()
  @IsBoolean()
  sharedCatalogEnabled?: boolean;

  @IsOptional()
  @IsObject()
  inheritedSettings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  overrideSettings?: Record<string, unknown>;
}

export class UpdateOrganizationSettingsDto {
  @IsObject()
  settings!: Record<string, unknown>;
}
