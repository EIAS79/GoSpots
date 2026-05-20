import type { PrismaService } from "../prisma/prisma.service";

export type MenuItemStockRow = {
  id: string;
  name: string;
  price: number;
  stock: number;
  stockDaily: number;
  stockResetOn: string | null;
  trackStock: boolean;
};

/** Apply daily stock reset for all tracked items in a shop (works before Prisma client regen). */
export async function resetShopMenuStockForDay(
  prisma: PrismaService,
  shopId: string,
  today: string,
) {
  await prisma.$executeRaw`
    UPDATE "MenuItem"
    SET
      "stock" = CASE
        WHEN COALESCE("stockDaily", 0) > 0 THEN "stockDaily"
        ELSE "stock"
      END,
      "stockResetOn" = ${today}
    WHERE "shopId" = ${shopId}
      AND "trackStock" = true
      AND (COALESCE("stockResetOn", '') <> ${today})
  `;
}

export async function fetchMenuItemStockRow(
  prisma: PrismaService,
  shopId: string,
  menuItemId: string,
): Promise<MenuItemStockRow | null> {
  const rows = await prisma.$queryRaw<MenuItemStockRow[]>`
    SELECT
      id,
      name,
      price,
      stock,
      COALESCE("stockDaily", stock) AS "stockDaily",
      "stockResetOn",
      "trackStock"
    FROM "MenuItem"
    WHERE id = ${menuItemId} AND "shopId" = ${shopId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function resetMenuItemStockForDay(
  prisma: PrismaService,
  menuItemId: string,
  today: string,
) {
  await prisma.$executeRaw`
    UPDATE "MenuItem"
    SET
      "stock" = CASE
        WHEN COALESCE("stockDaily", 0) > 0 THEN "stockDaily"
        ELSE "stock"
      END,
      "stockResetOn" = ${today}
    WHERE id = ${menuItemId}
      AND "trackStock" = true
      AND (COALESCE("stockResetOn", '') <> ${today})
  `;
}

export async function setMenuItemStockBaseline(
  prisma: PrismaService,
  menuItemId: string,
  stock: number,
  today: string,
) {
  await prisma.$executeRaw`
    UPDATE "MenuItem"
    SET stock = ${stock}, "stockDaily" = ${stock}, "stockResetOn" = ${today}
    WHERE id = ${menuItemId}
  `;
}

export async function adjustMenuItemStockBy(
  prisma: PrismaService,
  menuItemId: string,
  delta: number,
): Promise<boolean> {
  if (delta === 0) return true;
  const rows = await prisma.$queryRaw<{ stock: number; trackStock: boolean }[]>`
    SELECT stock, "trackStock" FROM "MenuItem" WHERE id = ${menuItemId} LIMIT 1
  `;
  const row = rows[0];
  if (!row?.trackStock) return true;
  if (delta > 0 && row.stock < delta) return false;
  if (delta > 0) {
    const updated = await prisma.$executeRaw`
      UPDATE "MenuItem"
      SET stock = stock - ${delta}
      WHERE id = ${menuItemId}
        AND "trackStock" = true
        AND stock >= ${delta}
    `;
    return Number(updated) > 0;
  }
  await prisma.$executeRaw`
    UPDATE "MenuItem"
    SET stock = stock + ${Math.abs(delta)}
    WHERE id = ${menuItemId} AND "trackStock" = true
  `;
  return true;
}
