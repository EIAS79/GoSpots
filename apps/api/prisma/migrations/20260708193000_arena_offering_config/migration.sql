-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('TIME', 'GAME', 'PERSON', 'MIXED');

-- AlterTable
ALTER TABLE "ResourceCategory"
ADD COLUMN "bookingMode" "BookingMode" NOT NULL DEFAULT 'TIME',
ADD COLUMN "playstationGames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "offeringConfig" JSONB;
