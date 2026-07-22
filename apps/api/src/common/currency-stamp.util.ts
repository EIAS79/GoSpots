import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Uppercase ISO 4217 or null when missing/blank. */
export function normalizeCurrencyCode(
  code: string | null | undefined,
): string | null {
  const c = code?.trim().toUpperCase();
  return c || null;
}

/**
 * Dual-read: prefer row stamp; fall back to shop currency (pre-M6 / null).
 */
export function effectiveMoneyCurrency(
  rowCurrency: string | null | undefined,
  shopCurrency: string,
): string {
  return (
    normalizeCurrencyCode(rowCurrency) ??
    normalizeCurrencyCode(shopCurrency) ??
    'EUR'
  );
}

/** Current Shop.currency for dual-write stamps. */
export async function loadShopCurrency(
  prisma: DbClient,
  shopId: string,
): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { currency: true },
  });
  return normalizeCurrencyCode(shop?.currency) ?? 'EUR';
}
