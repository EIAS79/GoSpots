-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "advertiseOnVenuesPage" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "ShopReviewsMode" AS ENUM ('ENABLED', 'DISABLED', 'HIDDEN');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "reviewsMode" "ShopReviewsMode" NOT NULL DEFAULT 'ENABLED';
