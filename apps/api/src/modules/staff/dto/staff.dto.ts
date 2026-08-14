import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ShopRole } from '@prisma/client';

const ASSIGNABLE_STAFF_ROLES: ShopRole[] = [
  ShopRole.STAFF,
  ShopRole.MANAGER,
  ShopRole.SUPERVISOR,
  ShopRole.CASHIER,
  ShopRole.SERVER,
  ShopRole.KITCHEN,
  ShopRole.INVENTORY,
  ShopRole.VIEWER,
];

export class CreateStaffDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-z0-9][a-z0-9._-]*$/i, {
    message: 'Username: 3–32 chars, letters/numbers, may include . _ -',
  })
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_STAFF_ROLES)
  role?: ShopRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_STAFF_ROLES)
  role?: ShopRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
