-- CreateTable (idempotent — safe if a prior run partially applied)
CREATE TABLE IF NOT EXISTS "GamingSection" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "seatsPerRow" INTEGER NOT NULL DEFAULT 6,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamingSection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "sectionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamingSection_shopId_categoryId_sortOrder_idx" ON "GamingSection"("shopId", "categoryId", "sortOrder");
CREATE INDEX IF NOT EXISTS "GamingSection_shopId_floor_sortOrder_idx" ON "GamingSection"("shopId", "floor", "sortOrder");
CREATE INDEX IF NOT EXISTS "Resource_shopId_sectionId_idx" ON "Resource"("shopId", "sectionId");

-- AddForeignKey (skip if already present)
DO $$ BEGIN
  ALTER TABLE "GamingSection" ADD CONSTRAINT "GamingSection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "GamingSection" ADD CONSTRAINT "GamingSection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ResourceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Resource" ADD CONSTRAINT "Resource_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "GamingSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: one default section per category that has resources
INSERT INTO "GamingSection" ("id", "shopId", "categoryId", "name", "floor", "isVip", "seatsPerRow", "sortOrder", "createdAt", "updatedAt")
SELECT
    'gs_' || c."id",
    c."shopId",
    c."id",
    'Main area',
    1,
    false,
    6,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ResourceCategory" c
WHERE EXISTS (SELECT 1 FROM "Resource" r WHERE r."categoryId" = c."id")
ON CONFLICT ("id") DO NOTHING;

UPDATE "Resource" r
SET "sectionId" = 'gs_' || r."categoryId"
WHERE r."categoryId" IS NOT NULL
  AND r."sectionId" IS NULL
  AND EXISTS (SELECT 1 FROM "GamingSection" g WHERE g."id" = 'gs_' || r."categoryId");
