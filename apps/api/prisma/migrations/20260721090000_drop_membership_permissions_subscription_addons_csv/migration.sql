-- M7 contract: drop legacy CSV columns after rows-primary cutover.
-- Preconditions: app writes MembershipPermission / SubscriptionAddOn only;
-- API emits computed permission/addOn CSV strings from rows.
-- pendingAddOns intentionally retained (still CSV-only).
-- OPERATOR: deploy after app that never SELECTs these columns is live.
-- Forbidden: prisma migrate reset. Rollback = PITR / restore column + backfill from rows.

ALTER TABLE "Membership" DROP COLUMN IF EXISTS "permissions";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "addOns";
