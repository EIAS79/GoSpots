-- Phase 10 — Workforce, Time Clock, Staff Accountability and Owner Controls
-- Expand-only. Existing Membership/EmployeeRate/Workforce facts remain authoritative.

CREATE TABLE "StaffEmploymentProfile" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "displayName" TEXT,
  "primaryJobRoleId" TEXT,
  "managerMembershipId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffEmploymentProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffEmploymentProfile_shopId_membershipId_key" ON "StaffEmploymentProfile"("shopId", "membershipId");
CREATE UNIQUE INDEX "StaffEmploymentProfile_shopId_employeeNumber_key" ON "StaffEmploymentProfile"("shopId", "employeeNumber");
CREATE INDEX "StaffEmploymentProfile_shopId_active_employeeNumber_idx" ON "StaffEmploymentProfile"("shopId", "active", "employeeNumber");
CREATE INDEX "StaffEmploymentProfile_shopId_managerMembershipId_idx" ON "StaffEmploymentProfile"("shopId", "managerMembershipId");

-- Existing staff receive stable, non-secret employment numbers. Owners remain owners, not employees.
INSERT INTO "StaffEmploymentProfile" (
  "id", "shopId", "membershipId", "employeeNumber", "displayName", "active",
  "createdById", "updatedById", "createdAt", "updatedAt"
)
SELECT
  'p10_' || md5(m."id" || ':profile'),
  m."shopId",
  m."id",
  'EMP-' || upper(substr(md5(m."shopId" || ':' || m."id"), 1, 8)),
  COALESCE(u."name", u."staffHandle", u."email"),
  true,
  s."ownerId",
  s."ownerId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Membership" m
JOIN "User" u ON u."id" = m."userId"
JOIN "Shop" s ON s."id" = m."shopId"
WHERE m."role"::text <> 'OWNER'
ON CONFLICT ("shopId", "membershipId") DO NOTHING;

CREATE TABLE "StaffOperatorCredential" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "badgeHash" TEXT,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffOperatorCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffOperatorCredential_failedAttempts_check" CHECK ("failedAttempts" >= 0)
);
CREATE UNIQUE INDEX "StaffOperatorCredential_shopId_membershipId_key" ON "StaffOperatorCredential"("shopId", "membershipId");
CREATE UNIQUE INDEX "StaffOperatorCredential_shopId_badgeHash_key" ON "StaffOperatorCredential"("shopId", "badgeHash");
CREATE INDEX "StaffOperatorCredential_shopId_active_lockedUntil_idx" ON "StaffOperatorCredential"("shopId", "active", "lockedUntil");

CREATE TABLE "StaffOperatorSession" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "authStrength" TEXT NOT NULL,
  "workstation" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffOperatorSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffOperatorSession_authStrength_check" CHECK ("authStrength" IN ('PIN','BADGE'))
);
CREATE UNIQUE INDEX "StaffOperatorSession_tokenHash_key" ON "StaffOperatorSession"("tokenHash");
CREATE INDEX "StaffOperatorSession_shopId_membershipId_expiresAt_idx" ON "StaffOperatorSession"("shopId", "membershipId", "expiresAt");
CREATE INDEX "StaffOperatorSession_shopId_revokedAt_expiresAt_idx" ON "StaffOperatorSession"("shopId", "revokedAt", "expiresAt");

CREATE TABLE "StaffApprovalPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actionKind" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "amountThresholdMinor" INTEGER,
  "requirePassword" BOOLEAN NOT NULL DEFAULT true,
  "notifyOnUse" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffApprovalPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffApprovalPolicy_threshold_check" CHECK ("amountThresholdMinor" IS NULL OR "amountThresholdMinor" >= 0),
  CONSTRAINT "StaffApprovalPolicy_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "StaffApprovalPolicy_shopId_actionKind_key" ON "StaffApprovalPolicy"("shopId", "actionKind");
CREATE INDEX "StaffApprovalPolicy_shopId_enabled_actionKind_idx" ON "StaffApprovalPolicy"("shopId", "enabled", "actionKind");

CREATE TABLE "StaffApprovalRequestV2" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actionKind" TEXT NOT NULL,
  "requesterMembershipId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "amountMinor" INTEGER,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "policyVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedByMembershipId" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffApprovalRequestV2_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffApprovalRequestV2_status_check" CHECK ("status" IN ('PENDING','APPROVED','DENIED','EXPIRED','CANCELLED')),
  CONSTRAINT "StaffApprovalRequestV2_amount_check" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0),
  CONSTRAINT "StaffApprovalRequestV2_policyVersion_check" CHECK ("policyVersion" > 0)
);
CREATE INDEX "StaffApprovalRequestV2_shopId_status_createdAt_idx" ON "StaffApprovalRequestV2"("shopId", "status", "createdAt");
CREATE INDEX "StaffApprovalRequestV2_shopId_requesterMembershipId_createdAt_idx" ON "StaffApprovalRequestV2"("shopId", "requesterMembershipId", "createdAt");
CREATE INDEX "StaffApprovalRequestV2_shopId_actionKind_sourceType_sourceId_idx" ON "StaffApprovalRequestV2"("shopId", "actionKind", "sourceType", "sourceId");

CREATE TABLE "StaffNotificationRule" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actionKind" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "amountThresholdMinor" INTEGER,
  "repeatWindowMinutes" INTEGER NOT NULL DEFAULT 60,
  "repeatCountThreshold" INTEGER NOT NULL DEFAULT 3,
  "afterHoursStartHour" INTEGER,
  "afterHoursEndHour" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffNotificationRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffNotificationRule_threshold_check" CHECK ("amountThresholdMinor" IS NULL OR "amountThresholdMinor" >= 0),
  CONSTRAINT "StaffNotificationRule_window_check" CHECK ("repeatWindowMinutes" BETWEEN 1 AND 10080),
  CONSTRAINT "StaffNotificationRule_count_check" CHECK ("repeatCountThreshold" BETWEEN 1 AND 1000),
  CONSTRAINT "StaffNotificationRule_start_hour_check" CHECK ("afterHoursStartHour" IS NULL OR "afterHoursStartHour" BETWEEN 0 AND 23),
  CONSTRAINT "StaffNotificationRule_end_hour_check" CHECK ("afterHoursEndHour" IS NULL OR "afterHoursEndHour" BETWEEN 0 AND 23),
  CONSTRAINT "StaffNotificationRule_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "StaffNotificationRule_shopId_actionKind_key" ON "StaffNotificationRule"("shopId", "actionKind");
CREATE INDEX "StaffNotificationRule_shopId_enabled_actionKind_idx" ON "StaffNotificationRule"("shopId", "enabled", "actionKind");

CREATE TABLE "StaffActionEvidence" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actionKind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "actorMembershipId" TEXT NOT NULL,
  "authenticatedUserId" TEXT NOT NULL,
  "approverMembershipId" TEXT,
  "approvalRequestId" TEXT,
  "authStrength" TEXT NOT NULL,
  "amountMinor" INTEGER,
  "suspicious" BOOLEAN NOT NULL DEFAULT false,
  "suspiciousReasons" JSONB,
  "context" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffActionEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffActionEvidence_authStrength_check" CHECK ("authStrength" IN ('PASSWORD','MFA','PIN','BADGE','SESSION')),
  CONSTRAINT "StaffActionEvidence_amount_check" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0)
);
CREATE INDEX "StaffActionEvidence_shopId_occurredAt_idx" ON "StaffActionEvidence"("shopId", "occurredAt");
CREATE INDEX "StaffActionEvidence_shopId_actorMembershipId_occurredAt_idx" ON "StaffActionEvidence"("shopId", "actorMembershipId", "occurredAt");
CREATE INDEX "StaffActionEvidence_shopId_actionKind_occurredAt_idx" ON "StaffActionEvidence"("shopId", "actionKind", "occurredAt");
CREATE INDEX "StaffActionEvidence_shopId_suspicious_occurredAt_idx" ON "StaffActionEvidence"("shopId", "suspicious", "occurredAt");
CREATE INDEX "StaffActionEvidence_shopId_approvalRequestId_idx" ON "StaffActionEvidence"("shopId", "approvalRequestId");

CREATE TABLE "WorkforcePolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "enforceSchedule" BOOLEAN NOT NULL DEFAULT false,
  "earlyClockInMinutes" INTEGER NOT NULL DEFAULT 15,
  "lateGraceMinutes" INTEGER NOT NULL DEFAULT 5,
  "overtimeWeeklySeconds" INTEGER NOT NULL DEFAULT 144000,
  "minimumBreakAfterSeconds" INTEGER NOT NULL DEFAULT 21600,
  "minimumBreakSeconds" INTEGER NOT NULL DEFAULT 1800,
  "operatorSessionMinutes" INTEGER NOT NULL DEFAULT 15,
  "pinLockoutAttempts" INTEGER NOT NULL DEFAULT 5,
  "pinLockoutMinutes" INTEGER NOT NULL DEFAULT 15,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkforcePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkforcePolicy_bounds_check" CHECK (
    "earlyClockInMinutes" BETWEEN 0 AND 240 AND
    "lateGraceMinutes" BETWEEN 0 AND 240 AND
    "overtimeWeeklySeconds" BETWEEN 0 AND 604800 AND
    "minimumBreakAfterSeconds" BETWEEN 0 AND 86400 AND
    "minimumBreakSeconds" BETWEEN 0 AND 21600 AND
    "operatorSessionMinutes" BETWEEN 1 AND 480 AND
    "pinLockoutAttempts" BETWEEN 2 AND 20 AND
    "pinLockoutMinutes" BETWEEN 1 AND 1440
  )
);
CREATE UNIQUE INDEX "WorkforcePolicy_shopId_key" ON "WorkforcePolicy"("shopId");

CREATE TABLE "ShiftSwapRequest" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "scheduleEntryId" TEXT NOT NULL,
  "requesterMembershipId" TEXT NOT NULL,
  "targetMembershipId" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedByMembershipId" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShiftSwapRequest_status_check" CHECK ("status" IN ('PENDING','APPROVED','DENIED','CANCELLED'))
);
CREATE INDEX "ShiftSwapRequest_shopId_status_createdAt_idx" ON "ShiftSwapRequest"("shopId", "status", "createdAt");
CREATE INDEX "ShiftSwapRequest_shopId_requesterMembershipId_createdAt_idx" ON "ShiftSwapRequest"("shopId", "requesterMembershipId", "createdAt");
CREATE INDEX "ShiftSwapRequest_shopId_scheduleEntryId_idx" ON "ShiftSwapRequest"("shopId", "scheduleEntryId");

-- Seed venue policy defaults without changing existing runtime behavior.
INSERT INTO "WorkforcePolicy" ("id", "shopId", "updatedById", "createdAt", "updatedAt")
SELECT 'p10_' || md5(s."id" || ':policy'), s."id", s."ownerId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Shop" s
ON CONFLICT ("shopId") DO NOTHING;

-- Tenant RLS parity for every Phase 10 shop-scoped table.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'StaffEmploymentProfile','StaffOperatorCredential','StaffOperatorSession',
    'StaffApprovalPolicy','StaffApprovalRequestV2','StaffNotificationRule',
    'StaffActionEvidence','WorkforcePolicy','ShiftSwapRequest'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))', 'tenant_isolation_' || lower(tbl), tbl);
  END LOOP;
END $$;
