import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import {
  moduleHasFeature,
  resolveEnabledModules,
} from './subscription-tier';

export async function assertShopFeature(
  prisma: PrismaService,
  shopId: string,
  feature: string,
): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { subscription: true },
  });
  const modules = resolveEnabledModules(shop?.subscription ?? null);
  if (!moduleHasFeature(modules, feature)) {
    throw new ForbiddenException(
      `This feature is not included in your venue pack. Add it from Subscription to unlock ${feature}.`,
    );
  }
}
