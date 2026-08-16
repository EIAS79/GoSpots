CREATE TABLE IF NOT EXISTS "CommercialMergeEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sourceCheckId" TEXT NOT NULL,
  "destinationCheckId" TEXT NOT NULL,
  "actorId" TEXT,
  "operation" TEXT NOT NULL,
  "movedVenueOrderIds" JSONB NOT NULL,
  "movedOperationsSessionIds" JSONB NOT NULL,
  "movedAdjustmentIds" JSONB NOT NULL,
  "movedServiceChargeIds" JSONB NOT NULL,
  "movedTipIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialMergeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommercialMergeEvent_shopId_sourceCheckId_createdAt_idx" ON "CommercialMergeEvent"("shopId","sourceCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "CommercialMergeEvent_shopId_destinationCheckId_createdAt_idx" ON "CommercialMergeEvent"("shopId","destinationCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "CommercialMergeEvent_shopId_createdAt_idx" ON "CommercialMergeEvent"("shopId","createdAt");
DO $$ BEGIN ALTER TABLE "CommercialMergeEvent" ADD CONSTRAINT "CommercialMergeEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CommercialMergeEvent" ADD CONSTRAINT "CommercialMergeEvent_sourceCheckId_fkey" FOREIGN KEY ("sourceCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CommercialMergeEvent" ADD CONSTRAINT "CommercialMergeEvent_destinationCheckId_fkey" FOREIGN KEY ("destinationCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
