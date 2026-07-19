-- Add guest tracking token for public gaming reservations
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "guestToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_guestToken_key" ON "Reservation"("guestToken");
