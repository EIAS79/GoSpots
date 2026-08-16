-- Phase 6 — restaurant/bar/cafe operations.
-- Additive operational metadata only. VenueOrder/GuestCheck/Settlement remain canonical.

CREATE TYPE "RestaurantOrderLifecycle" AS ENUM ('DRAFT','PLACED','ACKNOWLEDGED','IN_PREPARATION','READY','SERVED','CANCELLED','CLOSED');
CREATE TYPE "RestaurantOrderOrigin" AS ENUM ('STAFF','CASHIER','QR_TABLE');
CREATE TYPE "RestaurantFireState" AS ENUM ('HOLD','FIRE_LATER','FIRED');
CREATE TYPE "RestaurantPickupStatus" AS ENUM ('NOT_APPLICABLE','PREPARING','READY_FOR_PICKUP','COLLECTED');
CREATE TYPE "RestaurantTabStatus" AS ENUM ('NONE','OPEN','CLOSED');
CREATE TYPE "RestaurantPrinterJobStatus" AS ENUM ('QUEUED','PRINTING','PRINTED','FAILED');

CREATE TABLE "MenuServiceModePolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "serviceMode" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuServiceModePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuServiceModePolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MenuServiceModePolicy_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MenuServiceModePolicy_shopId_menuItemId_serviceMode_key" ON "MenuServiceModePolicy"("shopId","menuItemId","serviceMode");
CREATE INDEX "MenuServiceModePolicy_shopId_serviceMode_enabled_idx" ON "MenuServiceModePolicy"("shopId","serviceMode","enabled");

CREATE TABLE "MenuModifierAvailability" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "modifierId" TEXT NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuModifierAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuModifierAvailability_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MenuModifierAvailability_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "MenuModifier"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MenuModifierAvailability_shopId_modifierId_key" ON "MenuModifierAvailability"("shopId","modifierId");
CREATE INDEX "MenuModifierAvailability_shopId_available_idx" ON "MenuModifierAvailability"("shopId","available");

CREATE TABLE "RestaurantOrderOps" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "lifecycle" "RestaurantOrderLifecycle" NOT NULL DEFAULT 'DRAFT',
  "origin" "RestaurantOrderOrigin" NOT NULL DEFAULT 'STAFF',
  "displayNumber" TEXT NOT NULL,
  "prepQuoteMinutes" INTEGER,
  "pickupStatus" "RestaurantPickupStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "tabStatus" "RestaurantTabStatus" NOT NULL DEFAULT 'NONE',
  "tabName" TEXT,
  "preauthOperationId" TEXT,
  "currentResourceId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantOrderOps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantOrderOps_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderOps_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "VenueOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderOps_resourceId_fkey" FOREIGN KEY ("currentResourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderOps_prep_quote_nonnegative" CHECK ("prepQuoteMinutes" IS NULL OR "prepQuoteMinutes" >= 0),
  CONSTRAINT "RestaurantOrderOps_version_positive" CHECK ("version" > 0),
  CONSTRAINT "RestaurantOrderOps_tab_name" CHECK ("tabStatus" <> 'OPEN' OR length(trim(coalesce("tabName",''))) > 0)
);
CREATE UNIQUE INDEX "RestaurantOrderOps_orderId_key" ON "RestaurantOrderOps"("orderId");
CREATE UNIQUE INDEX "RestaurantOrderOps_shopId_displayNumber_key" ON "RestaurantOrderOps"("shopId","displayNumber");
CREATE INDEX "RestaurantOrderOps_shopId_lifecycle_updatedAt_idx" ON "RestaurantOrderOps"("shopId","lifecycle","updatedAt");
CREATE INDEX "RestaurantOrderOps_shopId_tabStatus_updatedAt_idx" ON "RestaurantOrderOps"("shopId","tabStatus","updatedAt");
CREATE INDEX "RestaurantOrderOps_shopId_pickupStatus_updatedAt_idx" ON "RestaurantOrderOps"("shopId","pickupStatus","updatedAt");

CREATE TABLE "RestaurantOrderLineOps" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "courseNumber" INTEGER NOT NULL DEFAULT 1,
  "fireState" "RestaurantFireState" NOT NULL DEFAULT 'HOLD',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "rush" BOOLEAN NOT NULL DEFAULT false,
  "firedAt" TIMESTAMP(3),
  "servedAt" TIMESTAMP(3),
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantOrderLineOps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantOrderLineOps_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderLineOps_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "VenueOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderLineOps_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "VenueOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderLineOps_course_positive" CHECK ("courseNumber" > 0),
  CONSTRAINT "RestaurantOrderLineOps_priority_bounds" CHECK ("priority" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "RestaurantOrderLineOps_orderLineId_key" ON "RestaurantOrderLineOps"("orderLineId");
CREATE INDEX "RestaurantOrderLineOps_shopId_orderId_courseNumber_fireState_idx" ON "RestaurantOrderLineOps"("shopId","orderId","courseNumber","fireState");

CREATE TABLE "RestaurantTableTransfer" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromResourceId" TEXT,
  "toResourceId" TEXT,
  "movedLineIds" JSONB NOT NULL,
  "fromSeat" INTEGER,
  "toSeat" INTEGER,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantTableTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantTableTransfer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableTransfer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "VenueOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableTransfer_fromResourceId_fkey" FOREIGN KEY ("fromResourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableTransfer_toResourceId_fkey" FOREIGN KEY ("toResourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableTransfer_seat_positive" CHECK (("fromSeat" IS NULL OR "fromSeat" > 0) AND ("toSeat" IS NULL OR "toSeat" > 0))
);
CREATE INDEX "RestaurantTableTransfer_shopId_orderId_createdAt_idx" ON "RestaurantTableTransfer"("shopId","orderId","createdAt");

CREATE TABLE "PrepStationGroup" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "expo" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrepStationGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrepStationGroup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrepStationGroup_shopId_name_key" ON "PrepStationGroup"("shopId","name");
CREATE INDEX "PrepStationGroup_shopId_active_sortOrder_idx" ON "PrepStationGroup"("shopId","active","sortOrder");

CREATE TABLE "PrepStationGroupMember" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrepStationGroupMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrepStationGroupMember_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrepStationGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PrepStationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrepStationGroupMember_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PrepStation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrepStationGroupMember_shopId_groupId_stationId_key" ON "PrepStationGroupMember"("shopId","groupId","stationId");
CREATE INDEX "PrepStationGroupMember_shopId_stationId_idx" ON "PrepStationGroupMember"("shopId","stationId");

CREATE TABLE "PrepTicketControl" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "recalledAt" TIMESTAMP(3),
  "recalledById" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "rush" BOOLEAN NOT NULL DEFAULT false,
  "held" BOOLEAN NOT NULL DEFAULT false,
  "holdUntil" TIMESTAMP(3),
  "firedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrepTicketControl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrepTicketControl_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrepTicketControl_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PrepTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrepTicketControl_priority_bounds" CHECK ("priority" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "PrepTicketControl_ticketId_key" ON "PrepTicketControl"("ticketId");
CREATE INDEX "PrepTicketControl_shopId_rush_priority_updatedAt_idx" ON "PrepTicketControl"("shopId","rush","priority","updatedAt");

CREATE TABLE "RestaurantPrinterRoute" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "printerKey" TEXT NOT NULL,
  "fallbackPrinterKey" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantPrinterRoute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantPrinterRoute_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantPrinterRoute_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PrepStation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantPrinterRoute_shopId_stationId_key" ON "RestaurantPrinterRoute"("shopId","stationId");
CREATE INDEX "RestaurantPrinterRoute_shopId_active_idx" ON "RestaurantPrinterRoute"("shopId","active");

CREATE TABLE "RestaurantPrinterJob" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "printerKey" TEXT NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "sequenceNumber" INTEGER NOT NULL,
  "dedupKey" TEXT NOT NULL,
  "status" "RestaurantPrinterJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "printedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantPrinterJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantPrinterJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantPrinterJob_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PrepTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantPrinterJob_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PrepStation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantPrinterJob_sequence_positive" CHECK ("sequenceNumber" > 0),
  CONSTRAINT "RestaurantPrinterJob_attempts_nonnegative" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "RestaurantPrinterJob_shopId_dedupKey_key" ON "RestaurantPrinterJob"("shopId","dedupKey");
CREATE UNIQUE INDEX "RestaurantPrinterJob_shopId_printerKey_sequenceNumber_key" ON "RestaurantPrinterJob"("shopId","printerKey","sequenceNumber");
CREATE INDEX "RestaurantPrinterJob_shopId_status_createdAt_idx" ON "RestaurantPrinterJob"("shopId","status","createdAt");
CREATE INDEX "RestaurantPrinterJob_shopId_ticketId_idx" ON "RestaurantPrinterJob"("shopId","ticketId");

CREATE TABLE "QrTableOrderToken" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 20,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QrTableOrderToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QrTableOrderToken_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QrTableOrderToken_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QrTableOrderToken_usage_bounds" CHECK ("maxUses" > 0 AND "useCount" >= 0 AND "useCount" <= "maxUses")
);
CREATE UNIQUE INDEX "QrTableOrderToken_tokenHash_key" ON "QrTableOrderToken"("tokenHash");
CREATE INDEX "QrTableOrderToken_shopId_resourceId_expiresAt_idx" ON "QrTableOrderToken"("shopId","resourceId","expiresAt");
CREATE INDEX "QrTableOrderToken_shopId_revokedAt_idx" ON "QrTableOrderToken"("shopId","revokedAt");

-- Database-enforced tenant isolation on every new tenant-scoped Phase 6 table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'MenuServiceModePolicy','MenuModifierAvailability','RestaurantOrderOps','RestaurantOrderLineOps',
    'RestaurantTableTransfer','PrepStationGroup','PrepStationGroupMember','PrepTicketControl',
    'RestaurantPrinterRoute','RestaurantPrinterJob','QrTableOrderToken'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))', t || '_tenant_policy', t);
  END LOOP;
END $$;
