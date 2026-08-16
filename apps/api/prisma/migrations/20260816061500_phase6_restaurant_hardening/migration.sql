-- Phase 6 hardening: presentation names/restock metadata, configurable KDS timers,
-- and a stable GuestCheck binding for repeated QR table orders.

CREATE TABLE "RestaurantMenuPresentation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "customerName" TEXT,
  "kitchenName" TEXT,
  "expectedRestockAt" TIMESTAMP(3),
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantMenuPresentation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantMenuPresentation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantMenuPresentation_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantMenuPresentation_shopId_menuItemId_key" ON "RestaurantMenuPresentation"("shopId","menuItemId");
CREATE INDEX "RestaurantMenuPresentation_shopId_expectedRestockAt_idx" ON "RestaurantMenuPresentation"("shopId","expectedRestockAt");

ALTER TABLE "MenuModifierAvailability" ADD COLUMN "expectedRestockAt" TIMESTAMP(3);
CREATE INDEX "MenuModifierAvailability_shopId_expectedRestockAt_idx" ON "MenuModifierAvailability"("shopId","expectedRestockAt");

CREATE TABLE "PrepStationTimerPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "warningPct" INTEGER NOT NULL DEFAULT 75,
  "overduePct" INTEGER NOT NULL DEFAULT 100,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrepStationTimerPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrepStationTimerPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrepStationTimerPolicy_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PrepStation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrepStationTimerPolicy_thresholds" CHECK ("warningPct" >= 1 AND "warningPct" < "overduePct" AND "overduePct" <= 500)
);
CREATE UNIQUE INDEX "PrepStationTimerPolicy_shopId_stationId_key" ON "PrepStationTimerPolicy"("shopId","stationId");
CREATE INDEX "PrepStationTimerPolicy_shopId_stationId_idx" ON "PrepStationTimerPolicy"("shopId","stationId");

ALTER TABLE "QrTableOrderToken" ADD COLUMN "guestCheckId" TEXT;
ALTER TABLE "QrTableOrderToken" ADD CONSTRAINT "QrTableOrderToken_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "QrTableOrderToken_shopId_guestCheckId_idx" ON "QrTableOrderToken"("shopId","guestCheckId");

ALTER TABLE "RestaurantMenuPresentation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantMenuPresentation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RestaurantMenuPresentation_tenant_policy" ON "RestaurantMenuPresentation"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "PrepStationTimerPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrepStationTimerPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PrepStationTimerPolicy_tenant_policy" ON "PrepStationTimerPolicy"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
