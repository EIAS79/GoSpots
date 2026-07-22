/**
 * Isolated shop fixtures for opt-in live concurrency recipes.
 * Only used when `concurrencyTestsEnabled()` — never against Neon.
 */
import { randomUUID } from 'crypto';
import {
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { dashboardKeyPersistFields, generateDashboardKey } from '../../src/common/dashboard-path';

export type ConcurrencyFixture = {
  prisma: PrismaClient;
  ownerId: string;
  shopId: string;
  shopSlug: string;
  resourceId: string;
  menuItemId: string;
  /** Delete shop (cascade) then owner. */
  cleanup: () => Promise<void>;
};

export async function createConcurrencyFixture(
  prisma: PrismaClient,
): Promise<ConcurrencyFixture> {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: {
      email: `concurrency-${suffix}@test.local`,
      passwordHash: 'concurrency-test-not-a-login',
      name: 'Concurrency Fixture',
      emailVerified: true,
    },
  });

  const keyFields = dashboardKeyPersistFields(generateDashboardKey());
  const shop = await prisma.shop.create({
    data: {
      slug: `concurrency-${suffix}`,
      ...keyFields,
      name: `Concurrency ${suffix}`,
      isPublished: true,
      ownerId: owner.id,
      timezone: 'UTC',
      currency: 'EUR',
    },
  });

  const resource = await prisma.resource.create({
    data: {
      shopId: shop.id,
      name: 'Race Unit',
      type: ResourceType.POOL,
      status: ResourceStatus.AVAILABLE,
      capacity: 4,
    },
  });

  const menuItem = await prisma.menuItem.create({
    data: {
      shopId: shop.id,
      name: 'Race Cola',
      price: 3.5,
      stock: 1,
      stockDaily: 1,
      trackStock: true,
      // Fixed day key so parallel SALE paths do not fight a live day-reset.
      stockResetOn: '2030-06-01',
      isAvailable: true,
    },
  });

  return {
    prisma,
    ownerId: owner.id,
    shopId: shop.id,
    shopSlug: shop.slug,
    resourceId: resource.id,
    menuItemId: menuItem.id,
    cleanup: async () => {
      await prisma.shop.delete({ where: { id: shop.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
    },
  };
}

export function conflictStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    status?: number;
    getStatus?: () => number;
    statusCode?: number;
  };
  if (typeof e.getStatus === 'function') return e.getStatus();
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  return undefined;
}
