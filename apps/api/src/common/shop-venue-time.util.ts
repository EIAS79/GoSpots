import type { Prisma, PrismaClient } from '@prisma/client';
import { resolveVenueTimeZone } from './venue-timezone.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Load venue locale + IANA timezone for calendar-day keys.
 * Uses raw SQL so callers work before/without a fresh Prisma client regen
 * (Shop.timezone is expand-only; defaults to UTC when column missing).
 */
export async function loadShopVenueTimeContext(
  prisma: DbClient,
  shopId: string,
): Promise<{ locale: string; timezone: string; resolvedTimeZone: string }> {
  try {
    const rows = await prisma.$queryRaw<
      { locale: string; timezone: string | null }[]
    >`
      SELECT locale, timezone FROM "Shop" WHERE id = ${shopId} LIMIT 1
    `;
    const row = rows[0];
    const locale = row?.locale ?? 'en';
    const timezone = row?.timezone?.trim() || 'UTC';
    return {
      locale,
      timezone,
      resolvedTimeZone: resolveVenueTimeZone({ timezone, locale }),
    };
  } catch {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { locale: true },
    });
    const locale = shop?.locale ?? 'en';
    return {
      locale,
      timezone: 'UTC',
      resolvedTimeZone: resolveVenueTimeZone({ timezone: 'UTC', locale }),
    };
  }
}
