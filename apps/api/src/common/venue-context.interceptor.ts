import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { classifyVenuePath } from './dashboard-path';
import { permissionsToEffectiveCsv } from './permissions';
import type { JwtAccessPayload } from '../modules/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

export const VENUE_PATH_HEADER = 'x-venue-path';

@Injectable()
export class VenueContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{
      user?: JwtAccessPayload;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const user = req.user;
    const raw = req.headers[VENUE_PATH_HEADER];
    const venuePath = Array.isArray(raw) ? raw[0] : raw;

    if (user && venuePath) {
      await this.applyVenueContext(user, venuePath);
    }

    return next.handle();
  }

  private async applyVenueContext(user: JwtAccessPayload, venuePath: string) {
    const ref = classifyVenuePath(venuePath);
    if (!ref) return;

    // Phase 3: always slug-only (legacy slug--key strips to slug; key not verified).
    const shop = await this.prisma.shop.findFirst({
      where: { slug: ref.slug },
      select: {
        id: true,
        subscription: { select: { tier: true } },
      },
    });
    if (!shop) return;

    if (user.sysRole === 'SUPER_ADMIN') {
      user.shopId = shop.id;
      user.shopRole = user.shopRole ?? 'OWNER';
      user.perms = user.perms ?? '*';
      user.tier = shop.subscription?.tier;
      return;
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.sub, shopId: shop.id, isActive: true },
      select: {
        role: true,
        permissionRows: { select: { permission: true } },
      },
    });
    if (!membership) return;

    user.shopId = shop.id;
    user.shopRole = membership.role;
    // Rows-primary: computed perms CSV for JWT (Membership.permissions column dropped).
    user.perms = permissionsToEffectiveCsv({
      permissionRows: membership.permissionRows,
    });
    user.tier = shop.subscription?.tier;
  }
}
