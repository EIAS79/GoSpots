-- Safe patches when migrate history is out of sync (run: pnpm exec prisma db execute --file prisma/pending-patches.sql)

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "country" TEXT;

ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "stockDaily" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "stockResetOn" TEXT;
UPDATE "MenuItem" SET "stockDaily" = "stock" WHERE "trackStock" = true AND "stockDaily" = 0;

ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "guestCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ShopOrder_shopId_archivedAt_createdAt_idx" ON "ShopOrder"("shopId", "archivedAt", "createdAt");

ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "billedAmount" DOUBLE PRECISION;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "billedAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "PlaySessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaySession_reservationId_key" ON "PlaySession"("reservationId");
CREATE INDEX IF NOT EXISTS "PlaySession_shopId_status_createdAt_idx" ON "PlaySession"("shopId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PlaySession_shopId_archivedAt_createdAt_idx" ON "PlaySession"("shopId", "archivedAt", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SeatingTableGroup" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeatingTableGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeatingTableGroup_shopId_sortOrder_idx" ON "SeatingTableGroup"("shopId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "SeatingTableGroup" ADD CONSTRAINT "SeatingTableGroup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SeatingTableGroup" ADD COLUMN IF NOT EXISTS "eventStartsAt" TIMESTAMP(3);
ALTER TABLE "SeatingTableGroup" ADD COLUMN IF NOT EXISTS "eventEndsAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "SeatingZone" AS ENUM ('INDOOR', 'OUTDOOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SeatingTableGroup" ADD COLUMN IF NOT EXISTS "zone" "SeatingZone" NOT NULL DEFAULT 'INDOOR';
CREATE INDEX IF NOT EXISTS "SeatingTableGroup_shopId_zone_sortOrder_idx" ON "SeatingTableGroup"("shopId", "zone", "sortOrder");

ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "staffAlert" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "floorCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SeatingTableGroup" ADD COLUMN IF NOT EXISTS "floor" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "SeatingTableGroup_shopId_zone_floor_sortOrder_idx"
  ON "SeatingTableGroup"("shopId", "zone", "floor", "sortOrder");

ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "tableReserved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "reservationFee" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "StoredImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/webp',
    "encoding" TEXT NOT NULL DEFAULT 'gzip',
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredImage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StoredImage_shopId_idx" ON "StoredImage"("shopId");
