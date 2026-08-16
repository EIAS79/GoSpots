-- Phase 7 inventory completion. Additive and upgrade-safe.
ALTER TABLE "InventoryProfile"
  ADD COLUMN IF NOT EXISTS "negativeStockPolicy" TEXT NOT NULL DEFAULT 'BLOCK',
  ADD COLUMN IF NOT EXISTS "costingMethod" TEXT NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
  ADD COLUMN IF NOT EXISTS "restockOnRefund" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "wasteApprovalThresholdMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockItem"
  ADD COLUMN IF NOT EXISTS "purchaseUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseToInventoryFactorMilli" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS "defaultLocationId" TEXT,
  ADD COLUMN IF NOT EXISTS "reorderLevelMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "preferredSupplierId" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseTaxCode" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseTaxRateBps" INTEGER,
  ADD COLUMN IF NOT EXISTS "latestPurchaseCostMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "negativeStockAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "legalName" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "taxIdentifier" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT,
  ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StockMovement"
  ADD COLUMN IF NOT EXISTS "reasonCode" TEXT,
  ADD COLUMN IF NOT EXISTS "approvalRef" TEXT,
  ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "documentRef" TEXT;
UPDATE "PurchaseOrder" SET "status"='SENT',"sentAt"=COALESCE("sentAt","orderedAt") WHERE "status"='ORDERED';
UPDATE "PurchaseOrder" SET "status"='PARTIALLY_RECEIVED' WHERE "status"='PARTIAL';
UPDATE "PurchaseOrder" SET "status"='CANCELLED' WHERE "status"='CANCELED';
ALTER TABLE "PurchaseOrderLine"
  ADD COLUMN IF NOT EXISTS "orderedPurchaseMilli" INTEGER,
  ADD COLUMN IF NOT EXISTS "receivedMilli" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GoodsReceipt"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceRef" TEXT,
  ADD COLUMN IF NOT EXISTS "documentRef" TEXT;
ALTER TABLE "GoodsReceiptLine"
  ADD COLUMN IF NOT EXISTS "purchaseQuantityMilli" INTEGER,
  ADD COLUMN IF NOT EXISTS "damagedMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lotBatch" TEXT,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Stocktake"
  ADD COLUMN IF NOT EXISTS "blindCount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "snapshotAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StocktakeLine" ADD COLUMN IF NOT EXISTS "countedAt" TIMESTAMP(3);
ALTER TABLE "StockTransfer"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
  ADD COLUMN IF NOT EXISTS "unitCostMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "receivedMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "damagedMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "missingMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "receivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "note" TEXT;
UPDATE "StockTransfer" t SET "status"='RECEIVED',"receivedMilli"=t."quantityMilli","receivedAt"=COALESCE(t."receivedAt",t."transferredAt")
WHERE EXISTS (SELECT 1 FROM "StockMovement" m WHERE m."shopId"=t."shopId" AND m."referenceType"='TRANSFER' AND m."referenceId"=t."id" AND m."kind"='TRANSFER_IN');
CREATE INDEX IF NOT EXISTS "StockItem_shopId_preferredSupplierId_idx" ON "StockItem"("shopId","preferredSupplierId");
CREATE INDEX IF NOT EXISTS "StockItem_shopId_defaultLocationId_idx" ON "StockItem"("shopId","defaultLocationId");
CREATE INDEX IF NOT EXISTS "Supplier_shopId_taxIdentifier_idx" ON "Supplier"("shopId","taxIdentifier");
CREATE INDEX IF NOT EXISTS "StockTransfer_shopId_status_transferredAt_idx" ON "StockTransfer"("shopId","status","transferredAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryProfile_negativeStockPolicy_check') THEN ALTER TABLE "InventoryProfile" ADD CONSTRAINT "InventoryProfile_negativeStockPolicy_check" CHECK ("negativeStockPolicy" IN ('BLOCK','WARN_ALLOW','ALLOW_SELECTED','ALLOW_WITH_APPROVAL')); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryProfile_costingMethod_check') THEN ALTER TABLE "InventoryProfile" ADD CONSTRAINT "InventoryProfile_costingMethod_check" CHECK ("costingMethod"='WEIGHTED_AVERAGE'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryProfile_wasteApprovalThreshold_check') THEN ALTER TABLE "InventoryProfile" ADD CONSTRAINT "InventoryProfile_wasteApprovalThreshold_check" CHECK ("wasteApprovalThresholdMinor">=0); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StockItem_purchaseFactor_check') THEN ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_purchaseFactor_check" CHECK ("purchaseToInventoryFactorMilli">0); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseOrder_status_check') THEN ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_status_check" CHECK ("status" IN ('DRAFT','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Stocktake_status_check') THEN ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_status_check" CHECK ("status" IN ('OPEN','SUBMITTED','POSTED')); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StockTransfer_status_check') THEN ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_status_check" CHECK ("status" IN ('IN_TRANSIT','RECEIVED','CANCELLED')); END IF;
END $$;
