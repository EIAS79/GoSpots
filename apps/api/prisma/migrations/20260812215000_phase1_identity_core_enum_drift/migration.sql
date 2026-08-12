-- Phase 1 migration-upgrade testing exposed missing User identity columns in
-- the committed migration chain. Reconcile only the missing columns here.
-- Existing TEXT-backed enums are left untouched because converting them in-place
-- can invalidate historical CHECK constraints; that wider legacy drift remains
-- visible in the non-blocking schema-drift report for a dedicated compatibility migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserAccountType') THEN
    CREATE TYPE "UserAccountType" AS ENUM ('VENUE_OWNER', 'VENUE_STAFF');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountType" "UserAccountType" NOT NULL DEFAULT 'VENUE_OWNER',
  ADD COLUMN IF NOT EXISTS "staffHandle" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3);

-- Historical staff records predate accountType. Preserve owners as owners and
-- classify non-owner users with staff/manager memberships as venue staff.
UPDATE "User" u
SET "accountType" = 'VENUE_STAFF'::"UserAccountType"
WHERE NOT EXISTS (SELECT 1 FROM "Shop" s WHERE s."ownerId" = u."id")
  AND EXISTS (
    SELECT 1
    FROM "Membership" m
    WHERE m."userId" = u."id"
      AND m."role"::text IN ('STAFF', 'MANAGER')
  );

-- Existing staff accounts were usable before passwordSetAt existed in the
-- committed migration chain; mark them activated rather than locking them out.
UPDATE "User"
SET "passwordSetAt" = COALESCE("passwordSetAt", CURRENT_TIMESTAMP)
WHERE "accountType" = 'VENUE_STAFF'::"UserAccountType";

CREATE INDEX IF NOT EXISTS "User_accountType_idx" ON "User"("accountType");
