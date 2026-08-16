import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(`PHASE7_UPGRADE_ASSERT: ${message}`); }

async function main() {
  const po = await prisma.purchaseOrder.findFirst({ where: { status: 'SENT', documentRef: null }, orderBy: { createdAt: 'desc' } });
  assert(po, 'legacy ORDERED purchase order was not migrated to SENT');
  assert(po.sentAt, 'legacy ORDERED purchase order did not receive sentAt evidence');

  const transfer = await prisma.stockTransfer.findFirst({ where: { status: 'RECEIVED' }, orderBy: { transferredAt: 'desc' } });
  assert(transfer, 'historical transfer with TRANSFER_IN was not migrated to RECEIVED');
  assert(transfer.receivedMilli === transfer.quantityMilli, 'historical transfer received quantity was not preserved');
  assert(transfer.receivedAt, 'historical transfer did not receive receivedAt evidence');

  const profile = await prisma.inventoryProfile.findUniqueOrThrow({ where: { shopId: po.shopId } });
  assert(profile.negativeStockPolicy === 'BLOCK' && profile.costingMethod === 'WEIGHTED_AVERAGE' && profile.restockOnRefund === true, 'new profile defaults are unsafe after upgrade');
  const item = await prisma.stockItem.findFirstOrThrow({ where: { shopId: po.shopId } });
  assert(item.purchaseToInventoryFactorMilli === 1000 && item.latestPurchaseCostMinor === 0 && item.negativeStockAllowed === false, 'new stock-item defaults are unsafe after upgrade');
  const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { shopId: po.shopId, purchaseOrderId: po.id } });
  assert(line.receivedMilli === 0, 'legacy PO line received quantity should default deterministically to zero');

  console.log(`PHASE7_UPGRADE_ASSERT=PASS shop=${po.shopId} po=${po.id} transfer=${transfer.id}`);
}

main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
