-- Phase 1 upgrade gate exposed historical Membership schema drift: these
-- canonical auth/RBAC columns exist in the Prisma datamodel but had no committed
-- migration. Add them expand-only so existing memberships remain valid.

ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inviteTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteExpiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Membership_inviteTokenHash_idx"
  ON "Membership"("inviteTokenHash");
