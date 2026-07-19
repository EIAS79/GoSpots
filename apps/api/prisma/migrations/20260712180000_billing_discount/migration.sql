-- Add staff discount percent for game billing (bookings + walk-ins)
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "billingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlaySession" ADD COLUMN IF NOT EXISTS "billingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
