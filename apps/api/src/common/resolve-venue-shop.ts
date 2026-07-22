import { ForbiddenException } from '@nestjs/common';
import { classifyVenuePath } from './dashboard-path';
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

  const ref = classifyVenuePath(venuePath);
  if (!ref) {
    throw new ForbiddenException('Invalid venue dashboard path.');
  }

  // Phase 3: always slug-only (legacy slug--key strips to slug; key not verified).
  const shop = await prisma.shop.findFirst({
    where: { slug: ref.slug },
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
