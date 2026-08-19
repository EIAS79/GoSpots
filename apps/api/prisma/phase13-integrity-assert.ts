import { PrismaService } from '../src/prisma/prisma.service';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectReject(run: () => Promise<unknown>, message: string) {
  let rejected = false;
  try { await run(); } catch { rejected = true; }
  invariant(rejected, message);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const prefix = `phase13_${Date.now()}`;
  try {
    const owner = await prisma.user.create({ data: { email: `${prefix}@gospots.invalid`, passwordHash: 'x', name: 'Phase 13 owner' } });
    const [shopA, shopB, shopC] = await Promise.all(['a', 'b', 'c'].map((suffix) => prisma.shop.create({ data: {
      name: `Phase 13 ${suffix.toUpperCase()}`,
      slug: `${prefix}-${suffix}`,
      dashboardKey: `${prefix}-${suffix}-key`,
      ownerId: owner.id,
      currency: 'PLN',
      timezone: 'Europe/Warsaw',
    } })));
    const organization = await prisma.organization.create({ data: { name: 'Phase 13 Org', slug: `${prefix}-org`, createdById: owner.id } });
    await prisma.organizationShop.createMany({ data: [
      { organizationId: organization.id, shopId: shopA.id, branchCode: 'A' },
      { organizationId: organization.id, shopId: shopB.id, branchCode: 'B' },
    ] });
    const [locA, locB, locC] = await Promise.all([
      prisma.inventoryLocation.create({ data: { shopId: shopA.id, name: 'Main' } }),
      prisma.inventoryLocation.create({ data: { shopId: shopB.id, name: 'Main' } }),
      prisma.inventoryLocation.create({ data: { shopId: shopC.id, name: 'Main' } }),
    ]);
    const [itemA, itemB, itemC] = await Promise.all([
      prisma.stockItem.create({ data: { shopId: shopA.id, sku: 'COLA', name: 'Cola' } }),
      prisma.stockItem.create({ data: { shopId: shopB.id, sku: 'COLA', name: 'Cola' } }),
      prisma.stockItem.create({ data: { shopId: shopC.id, sku: 'COLA', name: 'Cola' } }),
    ]);
    const transfer = await prisma.organizationInventoryTransfer.create({ data: {
      organizationId: organization.id,
      sourceShopId: shopA.id,
      destinationShopId: shopB.id,
      sourceStockItemId: itemA.id,
      destinationStockItemId: itemB.id,
      sourceLocationId: locA.id,
      destinationLocationId: locB.id,
      quantityMilli: 1000,
      idempotencyKey: `${prefix}:transfer`,
      requestHash: 'hash-1',
      requestedById: owner.id,
    } });
    invariant(transfer.status === 'IN_TRANSIT', 'Valid organization transfer did not persist in transit.');

    await expectReject(() => prisma.organizationInventoryTransfer.create({ data: {
      organizationId: organization.id,
      sourceShopId: shopA.id,
      destinationShopId: shopB.id,
      sourceStockItemId: itemA.id,
      destinationStockItemId: itemB.id,
      sourceLocationId: locA.id,
      destinationLocationId: locB.id,
      quantityMilli: 1000,
      idempotencyKey: `${prefix}:transfer`,
      requestHash: 'hash-2',
      requestedById: owner.id,
    } }), 'Duplicate organization transfer idempotency key was accepted.');

    await expectReject(() => prisma.organizationInventoryTransfer.create({ data: {
      organizationId: organization.id,
      sourceShopId: shopA.id,
      destinationShopId: shopC.id,
      sourceStockItemId: itemA.id,
      destinationStockItemId: itemC.id,
      sourceLocationId: locA.id,
      destinationLocationId: locC.id,
      quantityMilli: 1000,
      idempotencyKey: `${prefix}:foreign-destination`,
      requestHash: 'hash-3',
      requestedById: owner.id,
    } }), 'Database accepted a transfer to a venue outside the organization.');

    await expectReject(() => prisma.organizationInventoryTransfer.update({ where: { id: transfer.id }, data: {
      receivedMilli: 900, damagedMilli: 200, missingMilli: 0,
    } }), 'Database accepted receipt/discrepancy totals above dispatched quantity.');

    await prisma.dataImportJob.create({ data: {
      shopId: shopA.id,
      kind: 'PRODUCTS',
      status: 'PREVIEW_READY',
      sourceHash: `${prefix}-source`,
      rowCount: 1,
      rows: [{ name: 'Cola', price: '10' }],
      preview: { valid: true },
      createdById: owner.id,
    } });
    await expectReject(() => prisma.dataImportJob.create({ data: {
      shopId: shopA.id,
      kind: 'PRODUCTS',
      status: 'PREVIEW_READY',
      sourceHash: `${prefix}-source`,
      rowCount: 1,
      rows: [{ name: 'Other', price: '11' }],
      preview: { valid: true },
      createdById: owner.id,
    } }), 'Duplicate import source hash was accepted for the same tenant/kind.');

    console.log(JSON.stringify({ ok: true, organizationId: organization.id, transferId: transfer.id }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
