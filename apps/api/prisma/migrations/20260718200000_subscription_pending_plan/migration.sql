-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "pendingPackId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "pendingAddOns" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "pendingStaffSeatQuantity" INTEGER;
