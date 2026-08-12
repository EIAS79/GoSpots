-- Phase 1 upgrade gate exposed historical schema drift: Membership.isActive
-- exists in the canonical Prisma datamodel and is used by auth/RBAC code, but
-- no committed migration created it. Add it expand-only with a safe default so
-- existing memberships remain active and representative historical data upgrades.

ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
