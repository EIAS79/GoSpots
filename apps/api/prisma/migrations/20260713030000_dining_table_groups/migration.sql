-- Table groups: mixed seat counts per dining area
CREATE TABLE IF NOT EXISTS "DiningTableGroup" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT,
    "capacity" INTEGER NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "seatsPerRow" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTableGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "tableGroupId" TEXT;

CREATE INDEX IF NOT EXISTS "DiningTableGroup_shopId_sectionId_sortOrder_idx"
ON "DiningTableGroup"("shopId", "sectionId", "sortOrder");

ALTER TABLE "DiningTableGroup" ADD CONSTRAINT "DiningTableGroup_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiningTableGroup" ADD CONSTRAINT "DiningTableGroup_sectionId_fkey"
FOREIGN KEY ("sectionId") REFERENCES "GamingSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Resource" ADD CONSTRAINT "Resource_tableGroupId_fkey"
FOREIGN KEY ("tableGroupId") REFERENCES "DiningTableGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
