CREATE TABLE IF NOT EXISTS "CommercialDayClose" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "businessDate" TEXT NOT NULL,
  "openTabCount" INTEGER NOT NULL DEFAULT 0,
  "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
  "overrideReason" TEXT,
  "closedById" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialDayClose_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialDayClose_shopId_businessDate_key" ON "CommercialDayClose"("shopId","businessDate");
CREATE INDEX IF NOT EXISTS "CommercialDayClose_shopId_closedAt_idx" ON "CommercialDayClose"("shopId","closedAt");
DO $$ BEGIN ALTER TABLE "CommercialDayClose" ADD CONSTRAINT "CommercialDayClose_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
