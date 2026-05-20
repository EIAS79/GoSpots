-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'ONLINE', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TYPE "PlaySessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "billedAmount" DOUBLE PRECISION;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "billedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaySession" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "resourceId" TEXT,
    "reservationId" TEXT,
    "playerCount" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "label" TEXT,
    "note" TEXT,
    "status" "PlaySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaySession_reservationId_key" ON "PlaySession"("reservationId");
CREATE INDEX IF NOT EXISTS "PlaySession_shopId_status_createdAt_idx" ON "PlaySession"("shopId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PlaySession_shopId_archivedAt_createdAt_idx" ON "PlaySession"("shopId", "archivedAt", "createdAt");

ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
