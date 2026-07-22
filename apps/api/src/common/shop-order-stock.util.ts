import type { Prisma, PrismaClient } from '@prisma/client';
import { adjustMenuItemStockBy } from './menu-stock-db.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ShopOrderLineStockClaim = {
  id: string;
  menuItemId: string | null;
  quantity: number;
  lineStatus: string;
};

/**
 * Claim each ACTIVE line (ACTIVE→CANCELED) then restore stock.
 * Only the winner of each line claim restores — safe under concurrent
 * order-cancel, line-cancel, line-delete, and order-delete.
 * Returns total quantity restored across claimed lines.
 */
export async function claimActiveLinesAndRestoreStock(
  db: DbClient,
  shopId: string,
  orderId: string,
  lines: ShopOrderLineStockClaim[],
): Promise<number> {
  let restoredQty = 0;
  for (const line of lines) {
    if (line.lineStatus !== 'ACTIVE' || !line.menuItemId) continue;
    const claimed = await db.shopOrderLine.updateMany({
      where: {
        id: line.id,
        shopOrderId: orderId,
        lineStatus: 'ACTIVE',
      },
      data: { lineStatus: 'CANCELED' },
    });
    if (claimed.count !== 1) continue;
    await adjustMenuItemStockBy(db, line.menuItemId, -line.quantity, shopId);
    restoredQty += line.quantity;
  }
  return restoredQty;
}
