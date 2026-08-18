-- Phase 11 — Ticketing, QR/RFID, access, occupancy and lockers.
-- Expand/compatibility migration. Legacy RFID wallet rows remain readable, but
-- Phase 11 runtime no longer writes money to that legacy authority.

ALTER TYPE "TicketOrderStatus" ADD VALUE IF NOT EXISTS 'FULFILLED';

ALTER TABLE "TicketProduct" ADD COLUMN "menuItemId" TEXT;
ALTER TABLE "TicketOrder" ALTER COLUMN "totalMinor" DROP NOT NULL;
ALTER TABLE "TicketOrder" ADD COLUMN "settlementId" TEXT;
ALTER TABLE "TicketOrder" ADD COLUMN "guestCheckId" TEXT;
ALTER TABLE "TicketOrder" ADD COLUMN "requestHash" TEXT;
ALTER TABLE "TicketOrder" ADD COLUMN "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "sourceSnapshotId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "sourceOrderLineId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "reissuedFromId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RfidCredential" ALTER COLUMN "walletId" DROP NOT NULL;
ALTER TABLE "RfidCredential" ADD COLUMN "storedValueAccountId" TEXT;

CREATE UNIQUE INDEX "TicketProduct_shopId_menuItemId_key" ON "TicketProduct"("shopId", "menuItemId");
CREATE UNIQUE INDEX "TicketOrder_shopId_settlementId_key" ON "TicketOrder"("shopId", "settlementId");
CREATE INDEX "Ticket_shopId_sourceSnapshotId_idx" ON "Ticket"("shopId", "sourceSnapshotId");
CREATE INDEX "RfidCredential_shopId_storedValueAccountId_status_idx" ON "RfidCredential"("shopId", "storedValueAccountId", "status");

CREATE TYPE "AccessCredentialType" AS ENUM ('QR_TICKET', 'RFID', 'NFC', 'WRISTBAND', 'MEMBERSHIP', 'LOCKER');
CREATE TYPE "AccessCredentialStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');
CREATE TYPE "AccessRuleEffect" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "AccessDirection" AS ENUM ('ENTER', 'EXIT', 'VERIFY', 'CORRECTION');
CREATE TYPE "AccessDecision" AS ENUM ('ALLOWED', 'DENIED', 'DUPLICATE');
CREATE TYPE "LockerAvailability" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'DISABLED');
CREATE TYPE "LockerAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CANCELLED');
CREATE TYPE "LockerEventType" AS ENUM ('ASSIGNED', 'RELEASED', 'OPENED', 'CLOSED', 'MANUAL_OVERRIDE');

CREATE TABLE "AccessZone" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "zoneType" TEXT,
  "capacity" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessZone_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccessRule" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "effect" "AccessRuleEffect" NOT NULL DEFAULT 'ALLOW',
  "ticketProductId" TEXT,
  "membershipTierId" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "maxVisits" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccessCredential" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "type" "AccessCredentialType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT,
  "status" "AccessCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "ticketId" TEXT,
  "customerId" TEXT,
  "membershipId" TEXT,
  "storedValueAccountId" TEXT,
  "visitLimit" INTEGER,
  "visitsUsed" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessCredential_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccessScannerConfiguration" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "allowOfflineCache" BOOLEAN NOT NULL DEFAULT false,
  "offlineCacheTtlSeconds" INTEGER,
  "enforceSequence" BOOLEAN NOT NULL DEFAULT true,
  "lastSequence" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessScannerConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccessEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "credentialId" TEXT,
  "ticketId" TEXT,
  "deviceId" TEXT,
  "direction" "AccessDirection" NOT NULL,
  "decision" "AccessDecision" NOT NULL,
  "reasonCode" TEXT,
  "occupancyDelta" INTEGER NOT NULL DEFAULT 0,
  "deviceSequence" INTEGER,
  "offlineReplay" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT NOT NULL,
  "actorUserId" TEXT,
  "correctionOfId" TEXT,
  "metadataJson" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Locker" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sizeType" TEXT,
  "availability" "LockerAvailability" NOT NULL DEFAULT 'AVAILABLE',
  "rentalMenuItemId" TEXT,
  "depositMenuItemId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Locker_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LockerAssignment" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "lockerId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "customerId" TEXT,
  "ticketId" TEXT,
  "settlementId" TEXT,
  "status" "LockerAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LockerAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LockerEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "lockerId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "credentialId" TEXT,
  "type" "LockerEventType" NOT NULL,
  "deviceId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "metadataJson" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LockerEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessZone_shopId_code_key" ON "AccessZone"("shopId", "code");
CREATE UNIQUE INDEX "AccessZone_shopId_id_key" ON "AccessZone"("shopId", "id");
CREATE INDEX "AccessZone_shopId_active_name_idx" ON "AccessZone"("shopId", "active", "name");
CREATE INDEX "AccessRule_shopId_zoneId_active_priority_idx" ON "AccessRule"("shopId", "zoneId", "active", "priority");
CREATE INDEX "AccessRule_shopId_ticketProductId_active_idx" ON "AccessRule"("shopId", "ticketProductId", "active");
CREATE INDEX "AccessRule_shopId_membershipTierId_active_idx" ON "AccessRule"("shopId", "membershipTierId", "active");
CREATE UNIQUE INDEX "AccessCredential_shopId_tokenHash_key" ON "AccessCredential"("shopId", "tokenHash");
CREATE UNIQUE INDEX "AccessCredential_shopId_ticketId_key" ON "AccessCredential"("shopId", "ticketId");
CREATE INDEX "AccessCredential_shopId_customerId_status_idx" ON "AccessCredential"("shopId", "customerId", "status");
CREATE INDEX "AccessCredential_shopId_membershipId_status_idx" ON "AccessCredential"("shopId", "membershipId", "status");
CREATE INDEX "AccessCredential_shopId_storedValueAccountId_status_idx" ON "AccessCredential"("shopId", "storedValueAccountId", "status");
CREATE UNIQUE INDEX "AccessScannerConfiguration_shopId_deviceId_key" ON "AccessScannerConfiguration"("shopId", "deviceId");
CREATE INDEX "AccessScannerConfiguration_shopId_zoneId_idx" ON "AccessScannerConfiguration"("shopId", "zoneId");
CREATE UNIQUE INDEX "AccessEvent_shopId_idempotencyKey_key" ON "AccessEvent"("shopId", "idempotencyKey");
CREATE UNIQUE INDEX "AccessEvent_shopId_deviceId_deviceSequence_key" ON "AccessEvent"("shopId", "deviceId", "deviceSequence");
CREATE INDEX "AccessEvent_shopId_zoneId_occurredAt_idx" ON "AccessEvent"("shopId", "zoneId", "occurredAt");
CREATE INDEX "AccessEvent_shopId_credentialId_occurredAt_idx" ON "AccessEvent"("shopId", "credentialId", "occurredAt");
CREATE INDEX "AccessEvent_shopId_ticketId_occurredAt_idx" ON "AccessEvent"("shopId", "ticketId", "occurredAt");
CREATE UNIQUE INDEX "Locker_shopId_code_key" ON "Locker"("shopId", "code");
CREATE UNIQUE INDEX "Locker_shopId_id_key" ON "Locker"("shopId", "id");
CREATE INDEX "Locker_shopId_availability_code_idx" ON "Locker"("shopId", "availability", "code");
CREATE INDEX "LockerAssignment_shopId_lockerId_status_idx" ON "LockerAssignment"("shopId", "lockerId", "status");
CREATE INDEX "LockerAssignment_shopId_credentialId_status_idx" ON "LockerAssignment"("shopId", "credentialId", "status");
CREATE UNIQUE INDEX "LockerAssignment_one_active_per_locker" ON "LockerAssignment"("shopId", "lockerId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "LockerAssignment_one_active_per_credential" ON "LockerAssignment"("shopId", "credentialId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "LockerEvent_shopId_idempotencyKey_key" ON "LockerEvent"("shopId", "idempotencyKey");
CREATE INDEX "LockerEvent_shopId_lockerId_occurredAt_idx" ON "LockerEvent"("shopId", "lockerId", "occurredAt");
CREATE INDEX "LockerEvent_shopId_assignmentId_occurredAt_idx" ON "LockerEvent"("shopId", "assignmentId", "occurredAt");

-- Same-tenant lineage for new Phase 11 aggregates.
ALTER TABLE "AccessZone" ADD CONSTRAINT "AccessZone_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_zone_same_shop_fk" FOREIGN KEY ("shopId", "zoneId") REFERENCES "AccessZone"("shopId", "id") ON DELETE CASCADE;
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "AccessScannerConfiguration" ADD CONSTRAINT "AccessScannerConfiguration_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "AccessScannerConfiguration" ADD CONSTRAINT "AccessScannerConfiguration_zone_same_shop_fk" FOREIGN KEY ("shopId", "zoneId") REFERENCES "AccessZone"("shopId", "id") ON DELETE RESTRICT;
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_zone_same_shop_fk" FOREIGN KEY ("shopId", "zoneId") REFERENCES "AccessZone"("shopId", "id") ON DELETE RESTRICT;
ALTER TABLE "Locker" ADD CONSTRAINT "Locker_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "LockerAssignment" ADD CONSTRAINT "LockerAssignment_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "LockerAssignment" ADD CONSTRAINT "LockerAssignment_locker_same_shop_fk" FOREIGN KEY ("shopId", "lockerId") REFERENCES "Locker"("shopId", "id") ON DELETE RESTRICT;
ALTER TABLE "LockerEvent" ADD CONSTRAINT "LockerEvent_shop_fk" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE;
ALTER TABLE "LockerEvent" ADD CONSTRAINT "LockerEvent_locker_same_shop_fk" FOREIGN KEY ("shopId", "lockerId") REFERENCES "Locker"("shopId", "id") ON DELETE RESTRICT;

-- Domain guards.
ALTER TABLE "AccessZone" ADD CONSTRAINT "AccessZone_capacity_ck" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "AccessZone" ADD CONSTRAINT "AccessZone_version_ck" CHECK ("version" > 0);
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_time_ck" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_visits_ck" CHECK ("maxVisits" IS NULL OR "maxVisits" > 0);
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_visits_ck" CHECK ("visitsUsed" >= 0 AND ("visitLimit" IS NULL OR ("visitLimit" > 0 AND "visitsUsed" <= "visitLimit")));
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_authority_ck" CHECK ("ticketId" IS NOT NULL OR "membershipId" IS NOT NULL OR "customerId" IS NOT NULL OR "storedValueAccountId" IS NOT NULL);
ALTER TABLE "AccessScannerConfiguration" ADD CONSTRAINT "AccessScannerConfiguration_ttl_ck" CHECK ("offlineCacheTtlSeconds" IS NULL OR "offlineCacheTtlSeconds" > 0);
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_delta_ck" CHECK ("occupancyDelta" BETWEEN -100000 AND 100000);
ALTER TABLE "LockerAssignment" ADD CONSTRAINT "LockerAssignment_release_ck" CHECK (("status" = 'ACTIVE' AND "releasedAt" IS NULL) OR "status" <> 'ACTIVE');

-- Canonical commercial/identity references. Tenant equality is additionally
-- enforced in service queries; these FKs prevent orphaned authority links.
ALTER TABLE "TicketProduct" ADD CONSTRAINT "TicketProduct_menuItem_fk" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_settlement_fk" FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_guestCheck_fk" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_sourceSnapshot_fk" FOREIGN KEY ("sourceSnapshotId") REFERENCES "ChargeSnapshot"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "RfidCredential" ADD CONSTRAINT "RfidCredential_storedValue_fk" FOREIGN KEY ("storedValueAccountId") REFERENCES "StoredValueAccount"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_ticket_fk" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT;
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_membership_fk" FOREIGN KEY ("membershipId") REFERENCES "CustomerMembership"("id") ON DELETE RESTRICT;
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_storedValue_fk" FOREIGN KEY ("storedValueAccountId") REFERENCES "StoredValueAccount"("id") ON DELETE RESTRICT;
ALTER TABLE "LockerAssignment" ADD CONSTRAINT "LockerAssignment_credential_fk" FOREIGN KEY ("credentialId") REFERENCES "AccessCredential"("id") ON DELETE RESTRICT;
ALTER TABLE "LockerAssignment" ADD CONSTRAINT "LockerAssignment_settlement_fk" FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE RESTRICT;

-- Historical Phase 2 constraint becomes nullable-safe after dropping legacy
-- wallet authority. PostgreSQL FKs accept NULL and still protect old rows.
