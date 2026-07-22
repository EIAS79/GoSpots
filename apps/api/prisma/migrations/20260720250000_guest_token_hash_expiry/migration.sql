-- M4 guest token hashes + expiry (expand + backfill).
-- Dual-read: app accepts guestTokenHash OR legacy guestToken plaintext.
-- New writes store hash only (guestToken left null).
-- Never reset.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- GuestChat: allow nullable plaintext (hash becomes source of truth for new rows)
ALTER TABLE "GuestChat" ALTER COLUMN "guestToken" DROP NOT NULL;

ALTER TABLE "GuestChat" ADD COLUMN IF NOT EXISTS "guestTokenHash" TEXT;
ALTER TABLE "GuestChat" ADD COLUMN IF NOT EXISTS "guestTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "GuestChat" ADD COLUMN IF NOT EXISTS "guestTokenRevokedAt" TIMESTAMP(3);

ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "guestTokenHash" TEXT;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "guestTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "guestTokenRevokedAt" TIMESTAMP(3);

ALTER TABLE "EventRequest" ADD COLUMN IF NOT EXISTS "guestTokenHash" TEXT;
ALTER TABLE "EventRequest" ADD COLUMN IF NOT EXISTS "guestTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "EventRequest" ADD COLUMN IF NOT EXISTS "guestTokenRevokedAt" TIMESTAMP(3);

-- Backfill hashes from existing plaintext (SHA-256 hex matches Node crypto createHash('sha256').digest('hex'))
UPDATE "GuestChat"
SET
  "guestTokenHash" = encode(digest("guestToken", 'sha256'), 'hex'),
  "guestTokenExpiresAt" = COALESCE("guestTokenExpiresAt", "createdAt" + INTERVAL '7 days')
WHERE "guestToken" IS NOT NULL
  AND "guestTokenHash" IS NULL;

UPDATE "Reservation"
SET
  "guestTokenHash" = encode(digest("guestToken", 'sha256'), 'hex'),
  "guestTokenExpiresAt" = COALESCE(
    "guestTokenExpiresAt",
    COALESCE("endsAt", "startsAt", NOW()) + INTERVAL '30 days'
  )
WHERE "guestToken" IS NOT NULL
  AND "guestTokenHash" IS NULL;

UPDATE "EventRequest"
SET
  "guestTokenHash" = encode(digest("guestToken", 'sha256'), 'hex'),
  "guestTokenExpiresAt" = COALESCE(
    "guestTokenExpiresAt",
    COALESCE("preferredEndsAt", "preferredStartsAt", NOW()) + INTERVAL '30 days'
  )
WHERE "guestToken" IS NOT NULL
  AND "guestTokenHash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "GuestChat_guestTokenHash_key" ON "GuestChat"("guestTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_guestTokenHash_key" ON "Reservation"("guestTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "EventRequest_guestTokenHash_key" ON "EventRequest"("guestTokenHash");
