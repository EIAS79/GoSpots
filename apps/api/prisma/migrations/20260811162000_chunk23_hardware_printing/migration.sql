-- Chunk 23 — Hardware / Printing / Customer Displays (expand-only).
-- Reuses Chunk 06 Device registry and Chunk 10 Edge Hub signed-device identity.

ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'CUSTOMER_DISPLAY';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'BARCODE_SCANNER';

CREATE TYPE "PrintJobType" AS ENUM ('KITCHEN', 'BAR', 'CUSTOMER_RECEIPT', 'INVOICE', 'SHIFT', 'LABEL');
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'PRINTING', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "CustomerDisplayStatus" AS ENUM ('IDLE', 'ACTIVE', 'PAYMENT', 'COMPLETE', 'DISABLED');

CREATE TABLE "PrinterDeviceConfiguration" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "host" TEXT,
  "port" INTEGER,
  "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
  "capabilities" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrinterDeviceConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrinterDeviceConfiguration_port_range" CHECK ("port" IS NULL OR ("port" > 0 AND "port" <= 65535)),
  CONSTRAINT "PrinterDeviceConfiguration_paper_width" CHECK ("paperWidthMm" IN (58, 80, 112))
);

CREATE TABLE "PrintRoute" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "jobType" "PrintJobType" NOT NULL,
  "sourceKey" TEXT,
  "printerDeviceId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrintRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrintJob" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "type" "PrintJobType" NOT NULL,
  "routeId" TEXT,
  "printerDeviceId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "fiscalSemanticKey" TEXT,
  "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "claimedByEdgeDeviceId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "printingAt" TIMESTAMP(3),
  "printedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastError" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrintJob_attemptCount_nonnegative" CHECK ("attemptCount" >= 0),
  CONSTRAINT "PrintJob_maxAttempts_positive" CHECK ("maxAttempts" > 0)
);

CREATE TABLE "CustomerDisplayBinding" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "displayDeviceId" TEXT NOT NULL,
  "displayTokenHash" TEXT NOT NULL,
  "posDeviceId" TEXT,
  "status" "CustomerDisplayStatus" NOT NULL DEFAULT 'IDLE',
  "activeCheckId" TEXT,
  "snapshot" JSONB,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerDisplayBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BarcodeAlias" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BarcodeAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrinterDeviceConfiguration_deviceId_key" ON "PrinterDeviceConfiguration"("deviceId");
CREATE INDEX "PrinterDeviceConfiguration_shopId_enabled_idx" ON "PrinterDeviceConfiguration"("shopId", "enabled");
CREATE UNIQUE INDEX "PrintRoute_shopId_name_key" ON "PrintRoute"("shopId", "name");
CREATE INDEX "PrintRoute_shop_type_source_enabled_priority_idx" ON "PrintRoute"("shopId", "jobType", "sourceKey", "enabled", "priority");
CREATE INDEX "PrintRoute_printerDeviceId_enabled_idx" ON "PrintRoute"("printerDeviceId", "enabled");
CREATE UNIQUE INDEX "PrintJob_shopId_dedupeKey_key" ON "PrintJob"("shopId", "dedupeKey");
CREATE UNIQUE INDEX "PrintJob_shopId_fiscalSemanticKey_key" ON "PrintJob"("shopId", "fiscalSemanticKey");
CREATE INDEX "PrintJob_shop_status_created_idx" ON "PrintJob"("shopId", "status", "createdAt");
CREATE INDEX "PrintJob_printer_status_created_idx" ON "PrintJob"("printerDeviceId", "status", "createdAt");
CREATE INDEX "PrintJob_edge_status_idx" ON "PrintJob"("claimedByEdgeDeviceId", "status");
CREATE UNIQUE INDEX "CustomerDisplayBinding_displayDeviceId_key" ON "CustomerDisplayBinding"("displayDeviceId");
CREATE UNIQUE INDEX "CustomerDisplayBinding_displayTokenHash_key" ON "CustomerDisplayBinding"("displayTokenHash");
CREATE INDEX "CustomerDisplayBinding_shop_status_seen_idx" ON "CustomerDisplayBinding"("shopId", "status", "lastSeenAt");
CREATE INDEX "CustomerDisplayBinding_posDeviceId_idx" ON "CustomerDisplayBinding"("posDeviceId");
CREATE UNIQUE INDEX "BarcodeAlias_shopId_barcode_key" ON "BarcodeAlias"("shopId", "barcode");
CREATE INDEX "BarcodeAlias_shop_entity_idx" ON "BarcodeAlias"("shopId", "entityType", "entityId");

ALTER TABLE "PrinterDeviceConfiguration" ADD CONSTRAINT "PrinterDeviceConfiguration_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrinterDeviceConfiguration" ADD CONSTRAINT "PrinterDeviceConfiguration_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintRoute" ADD CONSTRAINT "PrintRoute_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintRoute" ADD CONSTRAINT "PrintRoute_printerDeviceId_fkey" FOREIGN KEY ("printerDeviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "PrintRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerDeviceId_fkey" FOREIGN KEY ("printerDeviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_claimedByEdgeDeviceId_fkey" FOREIGN KEY ("claimedByEdgeDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerDisplayBinding" ADD CONSTRAINT "CustomerDisplayBinding_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerDisplayBinding" ADD CONSTRAINT "CustomerDisplayBinding_displayDeviceId_fkey" FOREIGN KEY ("displayDeviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerDisplayBinding" ADD CONSTRAINT "CustomerDisplayBinding_posDeviceId_fkey" FOREIGN KEY ("posDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BarcodeAlias" ADD CONSTRAINT "BarcodeAlias_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['PrinterDeviceConfiguration','PrintRoute','PrintJob','CustomerDisplayBinding','BarcodeAlias'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))', t || '_tenant_policy', t);
  END LOOP;
END $$;
