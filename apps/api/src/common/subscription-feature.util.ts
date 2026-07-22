import type { PrismaService } from '../prisma/prisma.service';
import {
  assertShopHasFeature,
  getVenueEntitlementsForShop,
  hasFeature,
} from './venue-entitlements';

/**
 * Feature gate used by finance / menu / resources / reservations.
 * Delegates to central getVenueEntitlements / hasFeature.
 */
export async function assertShopFeature(
  prisma: PrismaService,
  shopId: string,
  feature: string,
): Promise<void> {
  await assertShopHasFeature(prisma, shopId, feature);
}

export { getVenueEntitlementsForShop, hasFeature };
