-- CreateTable
CREATE TABLE "SeatingTableGroup" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "availableCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingTableGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatingTableGroup_shopId_sortOrder_idx" ON "SeatingTableGroup"("shopId", "sortOrder");

-- AddForeignKey
ALTER TABLE "SeatingTableGroup" ADD CONSTRAINT "SeatingTableGroup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
