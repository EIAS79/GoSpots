-- Phase 13 — additive multi-location transfer and validation-first import records.
CREATE TYPE "OrganizationInventoryTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TYPE "DataImportKind" AS ENUM ('PRODUCTS', 'CUSTOMERS', 'OPENING_STOCK', 'RESOURCES', 'MEMBERS');
CREATE TYPE "DataImportStatus" AS ENUM ('PREVIEW_READY', 'COMMITTED', 'REJECTED');

CREATE TABLE "OrganizationInventoryTransfer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceShopId" TEXT NOT NULL,
  "destinationShopId" TEXT NOT NULL,
  "sourceStockItemId" TEXT NOT NULL,
  "destinationStockItemId" TEXT NOT NULL,
  "sourceLocationId" TEXT NOT NULL,
  "destinationLocationId" TEXT NOT NULL,
  "quantityMilli" INTEGER NOT NULL,
  "unitCostMinor" INTEGER NOT NULL DEFAULT 0,
  "receivedMilli" INTEGER NOT NULL DEFAULT 0,
  "damagedMilli" INTEGER NOT NULL DEFAULT 0,
  "missingMilli" INTEGER NOT NULL DEFAULT 0,
  "status" "OrganizationInventoryTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "receivedById" TEXT,
  "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationInventoryTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationInventoryTransfer_distinct_shops" CHECK ("sourceShopId" <> "destinationShopId"),
  CONSTRAINT "OrganizationInventoryTransfer_positive_quantity" CHECK ("quantityMilli" > 0),
  CONSTRAINT "OrganizationInventoryTransfer_nonnegative_receipt" CHECK ("receivedMilli" >= 0 AND "damagedMilli" >= 0 AND "missingMilli" >= 0),
  CONSTRAINT "OrganizationInventoryTransfer_receipt_bounded" CHECK (("receivedMilli" + "damagedMilli" + "missingMilli") <= "quantityMilli")
);

CREATE UNIQUE INDEX "OrganizationInventoryTransfer_organizationId_idempotencyKey_key"
  ON "OrganizationInventoryTransfer"("organizationId", "idempotencyKey");
CREATE INDEX "OrganizationInventoryTransfer_organizationId_status_transferredAt_idx"
  ON "OrganizationInventoryTransfer"("organizationId", "status", "transferredAt");
CREATE INDEX "OrganizationInventoryTransfer_sourceShopId_status_transferredAt_idx"
  ON "OrganizationInventoryTransfer"("sourceShopId", "status", "transferredAt");
CREATE INDEX "OrganizationInventoryTransfer_destinationShopId_status_transferredAt_idx"
  ON "OrganizationInventoryTransfer"("destinationShopId", "status", "transferredAt");

ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_source_org_shop_fkey"
  FOREIGN KEY ("organizationId", "sourceShopId") REFERENCES "OrganizationShop"("organizationId", "shopId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_destination_org_shop_fkey"
  FOREIGN KEY ("organizationId", "destinationShopId") REFERENCES "OrganizationShop"("organizationId", "shopId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_sourceStockItemId_fkey"
  FOREIGN KEY ("sourceStockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_destinationStockItemId_fkey"
  FOREIGN KEY ("destinationStockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_sourceLocationId_fkey"
  FOREIGN KEY ("sourceLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInventoryTransfer"
  ADD CONSTRAINT "OrganizationInventoryTransfer_destinationLocationId_fkey"
  FOREIGN KEY ("destinationLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DataImportJob" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "kind" "DataImportKind" NOT NULL,
  "status" "DataImportStatus" NOT NULL DEFAULT 'PREVIEW_READY',
  "sourceHash" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "rows" JSONB NOT NULL,
  "preview" JSONB NOT NULL,
  "result" JSONB,
  "createdById" TEXT NOT NULL,
  "committedById" TEXT,
  "committedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataImportJob_rowCount_nonnegative" CHECK ("rowCount" >= 0)
);
CREATE UNIQUE INDEX "DataImportJob_shopId_kind_sourceHash_key" ON "DataImportJob"("shopId", "kind", "sourceHash");
CREATE INDEX "DataImportJob_shopId_status_createdAt_idx" ON "DataImportJob"("shopId", "status", "createdAt");
ALTER TABLE "DataImportJob"
  ADD CONSTRAINT "DataImportJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FORCE RLS mirrors the established tenant posture. Organization transfer rows are visible
-- to either participating tenant, while cross-shop orchestration enters bypass only after
-- an OrganizationMembership authorization check.
ALTER TABLE "OrganizationInventoryTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationInventoryTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OrganizationInventoryTransfer_tenant_isolation" ON "OrganizationInventoryTransfer"
  FOR ALL
  USING (app_tenant_rls_ok("sourceShopId") OR app_tenant_rls_ok("destinationShopId"))
  WITH CHECK (app_tenant_rls_ok("sourceShopId") OR app_tenant_rls_ok("destinationShopId"));

ALTER TABLE "DataImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataImportJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DataImportJob_tenant_isolation" ON "DataImportJob"
  FOR ALL USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
