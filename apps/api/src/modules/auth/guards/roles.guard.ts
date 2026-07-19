import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ShopRole, SystemRole } from '@prisma/client';
import {
  PERMS_KEY,
  SHOP_ROLES_KEY,
  SYSTEM_ROLES_KEY,
} from '../decorators/roles.decorator';
import { JwtAccessPayload } from '../auth.service';
import { hasPermission } from '../../../common/permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const sysRoles = this.reflector.getAllAndOverride<SystemRole[]>(
      SYSTEM_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const shopRoles = this.reflector.getAllAndOverride<ShopRole[]>(
      SHOP_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const perms = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!sysRoles?.length && !shopRoles?.length && !perms?.length) return true;

    const req = ctx.switchToHttp().getRequest();
    const u = req.user as JwtAccessPayload | undefined;
    if (!u) throw new ForbiddenException('No auth context.');

    // System role gate (e.g. SUPER_ADMIN endpoints)
    if (sysRoles?.length) {
      if (!sysRoles.includes(u.sysRole as SystemRole)) {
        throw new ForbiddenException('Insufficient system role.');
      }
    }

    // Shop role gate
    if (shopRoles?.length) {
      if (!u.shopRole || !shopRoles.includes(u.shopRole as ShopRole)) {
        throw new ForbiddenException('Insufficient shop role.');
      }
    }

    // Permission gate (any-of)
    if (perms?.length) {
      const csv = u.perms ?? '';
      const ok = perms.some((p) => hasPermission(csv, p as never));
      if (!ok) throw new ForbiddenException('Missing permission.');
    }

    return true;
  }
}
