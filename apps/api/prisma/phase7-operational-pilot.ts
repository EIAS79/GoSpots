import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryPhase7Service } from '../src/modules/inventory-v2/inventory-phase7.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE7_PILOT: ${message}`);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = { record: async () => undefined } as any;
  const inventory = new InventoryPhase7Service(prisma, audit);
  const prefix = `p7pilot_${Date.now()}`;
  const userId = `${prefix}_user`;
  const shopId = `${prefix}_shop`;
  const actor = { sub: userId, shopId } as any;

  try {
    await prisma.user.create({ data: { id: userId, email: `${prefix}@gospots.invalid`, name: 'Phase 7 Pilot', passwordHash: 'x' } });
    await prisma.shop.create({ data: { id: shopId, name: 'Phase 7 Pilot', slug: prefix, dashboardKey: `${prefix}_key`, ownerId: userId, currency: 'PLN', timezone: 'Europe/Warsaw' } });

    await inventory.setProfile(actor, { enabled: true, legacyDualMode: false, negativeStockPolicy: 'BLOCK', restockOnRefund: true, wasteApprovalThresholdMinor: 0 });
    const mainLocation = await inventory.createLocation(actor, { name: 'Main' });
    const barLocation = await inventory.createLocation(actor, { name: 'Bar' });
    const supplier = await inventory.createSupplier(actor, { name: 'Pilot Supplier', legalName: 'Pilot Supplier sp. z o.o.', displayName: 'Pilot Supplier', taxIdentifier: 'PL0000000000', paymentTerms: '14 days', leadTimeDays: 2, contactName: 'Pilot Contact', email: 'supplier@gospots.invalid' });
    const item = await inventory.createItem(actor, { name: 'Pilot Ingredient', sku: `${prefix}_ingredient`, unit: 'g', purchaseUnit: 'kg', purchaseToInventoryFactorMilli: 1_000_000, defaultLocationId: mainLocation.id, reorderLevelMilli: 250_000, preferredSupplierId: supplier.id, purchaseTaxCode: 'FOOD', purchaseTaxRateBps: 800 });
    const menuItem = await prisma.menuItem.create({ data: { shopId, name: 'Pilot Dish', price: '20.00', trackStock: false } });
    const recipe = await inventory.createRecipe(actor, { key: `${prefix}_recipe`, name: 'Pilot Dish Recipe', menuItemId: menuItem.id, yieldMilli: 1000, components: [{ stockItemId: item.id, quantityMilli: 100_000 }] });

    const po = await inventory.createPurchaseOrder(actor, { supplierId: supplier.id, locationId: mainLocation.id, documentRef: `${prefix}-PO`, lines: [{ stockItemId: item.id, orderedPurchaseMilli: 2000, unitCostMinor: 100 }] });
    assert(po.status === 'DRAFT', 'purchase order must start DRAFT');
    await inventory.approvePo(actor, po.id);
    await inventory.sendPo(actor, po.id);

    const receipt1Body = { locationId: mainLocation.id, supplierId: supplier.id, invoiceRef: `${prefix}-INV-1`, documentRef: `${prefix}-GR-1`, lines: [{ stockItemId: item.id, purchaseQuantityMilli: 1000, unitCostMinor: 100, lotBatch: 'LOT-A' }] };
    const receipt1 = await inventory.receive(actor, receipt1Body, po.id, `${prefix}-receipt-1`) as any;
    const receipt1Replay = await inventory.receive(actor, receipt1Body, po.id, `${prefix}-receipt-1`) as any;
    assert(receipt1.id === receipt1Replay.id, 'duplicate receipt must replay the original result');
    assert(await prisma.goodsReceipt.count({ where: { shopId, idempotencyKey: `${prefix}-receipt-1` } }) === 1, 'duplicate receipt created more than one goods receipt');
    assert((await prisma.purchaseOrder.findUnique({ where: { id: po.id } }))?.status === 'PARTIALLY_RECEIVED', 'first receipt must leave PO partially received');

    const order1 = await prisma.venueOrder.create({ data: { shopId, serviceMode: 'DINE_IN', status: 'OPEN', currency: 'PLN', subtotalMinor: 2000, taxMinor: 0, totalMinor: 2000, createdById: userId } });
    const line1 = await prisma.venueOrderLine.create({ data: { shopId, orderId: order1.id, menuItemId: menuItem.id, quantity: 1, nameSnapshot: 'Pilot Dish', unitBaseMinor: 2000, unitPriceMinor: 2000, totalMinor: 2000, priceSnapshot: {} } });
    await inventory.completeOrder(actor, order1.id);
    const originalConsumption = await prisma.stockMovement.findUnique({ where: { movementKey: `sale:${line1.id}:${(await prisma.recipeComponent.findFirstOrThrow({ where: { shopId, recipeId: recipe.id } })).id}` } });
    assert(originalConsumption?.kind === 'SALE_CONSUMPTION' && originalConsumption.quantityMilli === -100_000, 'paid/completed sale did not consume the recipe quantity');

    const receipt2 = await inventory.receive(actor, { locationId: mainLocation.id, supplierId: supplier.id, invoiceRef: `${prefix}-INV-2`, lines: [{ stockItemId: item.id, purchaseQuantityMilli: 1000, unitCostMinor: 300, lotBatch: 'LOT-B' }] }, po.id, `${prefix}-receipt-2`) as any;
    assert(receipt2.id !== receipt1.id, 'second receipt must be a new receipt');
    assert((await prisma.purchaseOrder.findUnique({ where: { id: po.id } }))?.status === 'RECEIVED', 'fully received PO must close as RECEIVED');

    await inventory.updateRecipe(actor, recipe.id, { key: `${prefix}_recipe`, name: 'Pilot Dish Recipe v2', menuItemId: menuItem.id, yieldMilli: 1000, components: [{ stockItemId: item.id, quantityMilli: 200_000 }] });
    await inventory.reverseOrder(actor, order1.id, { reason: 'Pilot refund', restock: true });
    const reversal = await prisma.stockMovement.findUnique({ where: { movementKey: `reversal:${originalConsumption!.movementKey}` } });
    assert(reversal?.quantityMilli === -originalConsumption!.quantityMilli, 'refund/restock did not reverse original quantity');
    assert(reversal?.unitCostMinor === originalConsumption!.unitCostMinor && reversal?.totalCostMinor === originalConsumption!.totalCostMinor, 'recipe/cost change rewrote historical sale cost');

    const order2 = await prisma.venueOrder.create({ data: { shopId, serviceMode: 'DINE_IN', status: 'OPEN', currency: 'PLN', subtotalMinor: 4000, taxMinor: 0, totalMinor: 4000, createdById: userId } });
    const line2 = await prisma.venueOrderLine.create({ data: { shopId, orderId: order2.id, menuItemId: menuItem.id, quantity: 2, nameSnapshot: 'Pilot Dish', unitBaseMinor: 2000, unitPriceMinor: 2000, totalMinor: 4000, priceSnapshot: {} } });
    await inventory.completeOrder(actor, order2.id);
    const activeComponent = await prisma.recipeComponent.findFirstOrThrow({ where: { shopId, recipeId: recipe.id } });
    const newConsumption = await prisma.stockMovement.findUnique({ where: { movementKey: `sale:${line2.id}:${activeComponent.id}` } });
    assert(newConsumption?.quantityMilli === -400_000, 'updated recipe quantity was not applied to new sales');

    await inventory.waste(actor, { stockItemId: item.id, locationId: mainLocation.id, quantityMilli: 50_000, reasonCode: 'SPOILAGE', note: 'Pilot spoilage' });

    const transfer = await inventory.transfer(actor, { stockItemId: item.id, fromLocationId: mainLocation.id, toLocationId: barLocation.id, quantityMilli: 300_000, note: 'Pilot transfer' });
    assert(transfer.status === 'IN_TRANSIT', 'transfer must remain IN_TRANSIT until destination receipt');
    const preReceiveDestination = await prisma.stockMovement.aggregate({ where: { shopId, stockItemId: item.id, locationId: barLocation.id }, _sum: { quantityMilli: true } });
    assert((preReceiveDestination._sum.quantityMilli ?? 0) === 0, 'transfer credited destination before explicit receipt');
    const transferReceiveBody = { receivedMilli: 250_000, damagedMilli: 25_000, note: '25k missing, 25k damaged' };
    const receivedTransfer = await inventory.receiveTransfer(actor, transfer.id, transferReceiveBody, `${prefix}-transfer-receive`) as any;
    const receivedTransferReplay = await inventory.receiveTransfer(actor, transfer.id, transferReceiveBody, `${prefix}-transfer-receive`) as any;
    assert(receivedTransfer.id === receivedTransferReplay.id, 'transfer receive retry did not replay');
    assert(receivedTransfer.missingMilli === 25_000 && receivedTransfer.damagedMilli === 25_000, 'transfer discrepancy was not preserved');
    assert(await prisma.stockMovement.count({ where: { shopId, referenceType: 'TRANSFER', referenceId: transfer.id } }) === 3, 'transfer should have exactly OUT, IN and DAMAGE movements');

    const staleTake = await inventory.startStocktake(actor, { locationId: barLocation.id, stockItemIds: [item.id], blindCount: true });
    const staleLine = await prisma.stocktakeLine.findFirstOrThrow({ where: { shopId, stocktakeId: staleTake.id, stockItemId: item.id } });
    await inventory.countStocktake(actor, staleTake.id, { lines: [{ stockItemId: item.id, countedMilli: staleLine.expectedMilli }] });
    await inventory.submitStocktake(actor, staleTake.id);
    await inventory.waste(actor, { stockItemId: item.id, locationId: barLocation.id, quantityMilli: 10_000, reasonCode: 'SPILL', note: 'Concurrent movement proof' });
    let concurrencyBlocked = false;
    try { await inventory.approveStocktake(actor, staleTake.id); } catch (error) { concurrencyBlocked = String(error).includes('STOCKTAKE_CONCURRENT_MOVEMENT'); }
    assert(concurrencyBlocked, 'stocktake approval did not detect movement after snapshot');

    const freshTake = await inventory.startStocktake(actor, { locationId: barLocation.id, stockItemIds: [item.id], blindCount: false });
    const freshLine = await prisma.stocktakeLine.findFirstOrThrow({ where: { shopId, stocktakeId: freshTake.id, stockItemId: item.id } });
    assert(freshLine.expectedMilli >= 5_000, 'pilot destination stock is unexpectedly low');
    await inventory.countStocktake(actor, freshTake.id, { lines: [{ stockItemId: item.id, countedMilli: freshLine.expectedMilli - 5_000 }] });
    await inventory.submitStocktake(actor, freshTake.id);
    const postedTake = await inventory.approveStocktake(actor, freshTake.id);
    assert(postedTake.status === 'POSTED', 'fresh stocktake did not post');
    assert((await prisma.stockMovement.findUnique({ where: { movementKey: `stocktake:${freshTake.id}:${item.id}` } }))?.quantityMilli === -5_000, 'stocktake variance was not represented as an immutable movement');

    const costing = await inventory.costing(actor) as any;
    const itemCosting = costing.items.find((entry: any) => entry.id === item.id);
    assert(costing.costingMethod === 'WEIGHTED_AVERAGE', 'chosen valuation method missing from costing output');
    assert(itemCosting && itemCosting.latestPurchaseCostMinor === 300, 'latest purchase cost is incorrect');
    assert(itemCosting.actualUsageMilli >= itemCosting.theoreticalUsageMilli, 'actual-vs-theoretical usage was not calculated');
    assert(itemCosting.wasteCostMinor > 0 && itemCosting.stocktakeVarianceMilli === -5_000, 'waste/stocktake variance costing is incomplete');
    assert(costing.recipes.some((entry: any) => entry.id === recipe.id && entry.version === 2 && entry.theoreticalCostMinor > 0), 'versioned recipe theoretical cost is missing');
    assert(costing.margin.revenueMinor === 4000 && costing.margin.cogsMinor > 0, 'gross-margin output does not reflect the completed sale');

    const movements = await prisma.stockMovement.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
    assert(new Set(movements.map(m => m.movementKey)).size === movements.length, 'movement keys are not unique');
    assert(movements.every(m => m.actorUserId && m.kind && Number.isInteger(m.quantityMilli) && Number.isInteger(m.unitCostMinor) && Number.isInteger(m.totalCostMinor)), 'pilot contains an unexplained/non-costed stock movement');
    const requiredKinds = ['RECEIPT','SALE_CONSUMPTION','SALE_REVERSAL','WASTE','TRANSFER_OUT','TRANSFER_IN','TRANSFER_DAMAGE','STOCKTAKE_ADJUSTMENT'];
    for (const kind of requiredKinds) assert(movements.some(m => m.kind === kind), `pilot did not exercise ${kind}`);

    console.log(`PHASE7_OPERATIONAL_PILOT=PASS movements=${movements.length} po=${po.id} order=${order2.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
