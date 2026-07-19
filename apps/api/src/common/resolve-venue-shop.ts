import { ForbiddenException } from '@nestjs/common';
import { parseDashboardPath } from './dashboard-path';
import type { JwtAccessPayload } from '../modules/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/** Resolve tenant shop id from JWT and/or dashboard URL segment. */
export async function resolveVenueShopId(
  prisma: PrismaService,
  actor: JwtAccessPayload,
  venuePath?: string,
): Promise<string> {
  if (actor.shopId) return actor.shopId;

  if (!venuePath?.trim()) {
    throw new ForbiddenException(
      'Open a venue dashboard first, then try again.',
    );
  }

  const parsed = parseDashboardPath(venuePath.trim());
  if (!parsed) {
    throw new ForbiddenException('Invalid venue dashboard path.');
  }

  const shop = await prisma.shop.findFirst({
    where: { slug: parsed.slug, dashboardKey: parsed.dashboardKey },
    select: { id: true },
  });
  if (!shop) {
    throw new ForbiddenException('Venue not found.');
  }

  if (actor.sysRole === 'SUPER_ADMIN') {
    return shop.id;
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: actor.sub, shopId: shop.id, isActive: true },
    select: { id: true },
  });
  if (!membership) {
    throw new ForbiddenException('You do not have access to this venue.');
  }

  return shop.id;
}
