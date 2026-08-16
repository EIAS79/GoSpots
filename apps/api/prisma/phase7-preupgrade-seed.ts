import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prefix = `p7upgrade_${Date.now()}`;
  const userId = `${prefix}_user`;
  const shopId = `${prefix}_shop`;
  const locA = `${prefix}_a`;
  const locB = `${prefix}_b`;
  const itemId = `${prefix}_item`;
  const supplierId = `${prefix}_supplier`;
  const poId = `${prefix}_po`;
  const transferId = `${prefix}_transfer`;
  const lineId = `${prefix}_line`;

  await prisma.$executeRawUnsafe(`INSERT INTO "User" ("id","email","passwordHash","name","createdAt","updatedAt") VALUES ($1,$2,'x','Phase 7 Upgrade',NOW(),NOW())`, userId, `${prefix}@gospots.invalid`);
  await prisma.$executeRawUnsafe(`INSERT INTO "Shop" ("id","slug","dashboardKey","name","ownerId","currency","timezone","createdAt","updatedAt") VALUES ($1,$2,$3,'Phase 7 Upgrade',$4,'PLN','Europe/Warsaw',NOW(),NOW())`, shopId, prefix, `${prefix}_key`, userId);
  await prisma.$executeRawUnsafe(`INSERT INTO "InventoryProfile" ("shopId","enabled","legacyDualMode","createdAt","updatedAt") VALUES ($1,true,false,NOW(),NOW())`, shopId);
  await prisma.$executeRawUnsafe(`INSERT INTO "InventoryLocation" ("id","shopId","name","createdAt","updatedAt") VALUES ($1,$3,'Main',NOW(),NOW()),($2,$3,'Bar',NOW(),NOW())`, locA, locB, shopId);
  await prisma.$executeRawUnsafe(`INSERT INTO "StockItem" ("id","shopId","name","sku","unit","weightedAverageCostMinor","createdAt","updatedAt") VALUES ($1,$2,'Legacy Ingredient',$3,'unit',125,NOW(),NOW())`, itemId, shopId, `${prefix}_sku`);
  await prisma.$executeRawUnsafe(`INSERT INTO "Supplier" ("id","shopId","name","createdAt","updatedAt") VALUES ($1,$2,'Legacy Supplier',NOW(),NOW())`, supplierId, shopId);
  await prisma.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" ("id","shopId","supplierId","locationId","status","orderedAt","createdById","createdAt","updatedAt") VALUES ($1,$2,$3,$4,'ORDERED',NOW(),$5,NOW(),NOW())`, poId, shopId, supplierId, locA, userId);
  await prisma.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine" ("id","shopId","purchaseOrderId","stockItemId","orderedMilli","unitCostMinor") VALUES ($1,$2,$3,$4,1000,125)`, lineId, shopId, poId, itemId);
  await prisma.$executeRawUnsafe(`INSERT INTO "StockTransfer" ("id","shopId","stockItemId","fromLocationId","toLocationId","quantityMilli","actorUserId") VALUES ($1,$2,$3,$4,$5,500,$6)`, transferId, shopId, itemId, locA, locB, userId);
  await prisma.$executeRawUnsafe(`INSERT INTO "StockMovement" ("shopId","stockItemId","locationId","kind","quantityMilli","unitCostMinor","totalCostMinor","referenceType","referenceId","movementKey","actorUserId") VALUES ($1,$2,$3,'TRANSFER_IN',500,125,63,'TRANSFER',$4,$5,$6)`, shopId, itemId, locB, transferId, `${prefix}:transfer:in`, userId);

  console.log(`PHASE7_PREUPGRADE_SEED=${prefix}`);
}

main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
