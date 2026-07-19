-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "venueType" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "packId" TEXT NOT NULL DEFAULT 'gaming';
ALTER TABLE "Subscription" ADD COLUMN "addOns" TEXT NOT NULL DEFAULT '';
