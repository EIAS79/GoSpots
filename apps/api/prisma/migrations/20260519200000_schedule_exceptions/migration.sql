-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "label" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduleException_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScheduleException_shopId_date_key" ON "ScheduleException"("shopId", "date");
CREATE INDEX "ScheduleException_shopId_idx" ON "ScheduleException"("shopId");
