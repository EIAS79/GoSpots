import { SetMetadata } from "@nestjs/common";
import { ShopRole, SystemRole } from "@prisma/client";

export const SYSTEM_ROLES_KEY = "systemRoles";
export const SHOP_ROLES_KEY = "shopRoles";
export const PERMS_KEY = "perms";

export const SystemRoles = (...roles: SystemRole[]) =>
  SetMetadata(SYSTEM_ROLES_KEY, roles);
export const ShopRoles = (...roles: ShopRole[]) =>
  SetMetadata(SHOP_ROLES_KEY, roles);
export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(PERMS_KEY, perms);
