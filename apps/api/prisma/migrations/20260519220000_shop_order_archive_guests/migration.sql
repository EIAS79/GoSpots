ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "guestCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ShopOrder_shopId_archivedAt_createdAt_idx" ON "ShopOrder"("shopId", "archivedAt", "createdAt");
