-- CreateEnum
CREATE TYPE "EventRequestType" AS ENUM ('BIRTHDAY', 'MEETING', 'PARTY', 'CORPORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "EventRequestSource" AS ENUM ('CLIENT_WEB', 'PHONE', 'STAFF');

-- CreateEnum
CREATE TYPE "EventRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELED');

-- CreateTable
CREATE TABLE "EventRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "eventType" "EventRequestType" NOT NULL DEFAULT 'OTHER',
    "source" "EventRequestSource" NOT NULL DEFAULT 'CLIENT_WEB',
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "preferredStartsAt" TIMESTAMP(3) NOT NULL,
    "preferredEndsAt" TIMESTAMP(3),
    "zone" "SeatingZone",
    "floor" INTEGER,
    "message" TEXT,
    "status" "EventRequestStatus" NOT NULL DEFAULT 'PENDING',
    "staffResponseNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "seatingTableGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventRequest_shopId_status_createdAt_idx" ON "EventRequest"("shopId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_seatingTableGroupId_fkey" FOREIGN KEY ("seatingTableGroupId") REFERENCES "SeatingTableGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
