-- Scope-completeness refinements for Chunks 11–15.
ALTER TABLE "MenuItemCommerceProfile" ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MenuItemCommerceProfile_shopId_favorite_idx" ON "MenuItemCommerceProfile"("shopId", "favorite");

CREATE TABLE "LegacyInventoryMapping" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "locationId" TEXT,
  "migratedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegacyInventoryMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LegacyInventoryMapping_shopId_menuItemId_key" ON "LegacyInventoryMapping"("shopId", "menuItemId");
CREATE INDEX "LegacyInventoryMapping_shopId_stockItemId_idx" ON "LegacyInventoryMapping"("shopId", "stockItemId");
CREATE INDEX "LegacyInventoryMapping_shopId_migratedAt_idx" ON "LegacyInventoryMapping"("shopId", "migratedAt");
