-- AuthSession refresh-token family for reuse detection / family revoke.
-- Hash column already existed (SHA-256). No migrate reset.

ALTER TABLE "AuthSession" ADD COLUMN IF NOT EXISTS "familyId" TEXT;

-- Existing rows: each session is its own family (no cross-device revoke on legacy reuse).
UPDATE "AuthSession" SET "familyId" = "id" WHERE "familyId" IS NULL;

ALTER TABLE "AuthSession" ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "AuthSession_familyId_idx" ON "AuthSession"("familyId");

-- Deduplicate hashes before unique (should be none; defensive).
DELETE FROM "AuthSession" a
USING "AuthSession" b
WHERE a."refreshTokenHash" = b."refreshTokenHash"
  AND a."id" < b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");
