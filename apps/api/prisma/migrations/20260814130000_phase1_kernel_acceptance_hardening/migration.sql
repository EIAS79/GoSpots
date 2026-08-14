-- Phase 1 final kernel hardening. Add missing optimistic-version state using
-- metadata-only defaults, then validate the complete version and tenant graph.

ALTER TABLE "Reservation"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Stocktake"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "RfidCredential"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "GuestCheck"
  ADD CONSTRAINT "GuestCheck_version_check" CHECK ("version" > 0) NOT VALID;
ALTER TABLE "OperationsSession"
  ADD CONSTRAINT "OperationsSession_version_check" CHECK ("version" > 0) NOT VALID;
ALTER TABLE "AutomationRule"
  ADD CONSTRAINT "AutomationRule_version_check" CHECK ("version" > 0) NOT VALID;
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_version_check" CHECK ("version" > 0) NOT VALID;
ALTER TABLE "Stocktake"
  ADD CONSTRAINT "Stocktake_version_check" CHECK ("version" > 0) NOT VALID;
ALTER TABLE "RfidCredential"
  ADD CONSTRAINT "RfidCredential_version_check" CHECK ("version" > 0) NOT VALID;

ALTER TABLE "GuestCheck" VALIDATE CONSTRAINT "GuestCheck_version_check";
ALTER TABLE "OperationsSession" VALIDATE CONSTRAINT "OperationsSession_version_check";
ALTER TABLE "AutomationRule" VALIDATE CONSTRAINT "AutomationRule_version_check";
ALTER TABLE "Reservation" VALIDATE CONSTRAINT "Reservation_version_check";
ALTER TABLE "Stocktake" VALIDATE CONSTRAINT "Stocktake_version_check";
ALTER TABLE "RfidCredential" VALIDATE CONSTRAINT "RfidCredential_version_check";

-- The expand migration installed this FK NOT VALID after verifying legacy
-- ownership in CI. Production reconciliation also found zero orphan rows.
ALTER TABLE "IdempotencyReceipt"
  VALIDATE CONSTRAINT "IdempotencyReceipt_shopId_fkey";
