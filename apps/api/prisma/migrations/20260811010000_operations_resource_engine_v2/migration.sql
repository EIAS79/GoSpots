-- Chunk 11: Operations Workspace + Resource Engine 2.0
CREATE TABLE "OperationsRatePlan" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceId" TEXT,
  "resourceCategoryId" TEXT,
  "name" TEXT NOT NULL,
  "hourlyRateMinor" INTEGER NOT NULL,
  "overtimeRateMinor" INTEGER,
  "overtimeAfterMinutes" INTEGER,
  "roundingMinutes" INTEGER NOT NULL DEFAULT 1,
  "minimumMinutes" INTEGER NOT NULL DEFAULT 0,
  "capMinor" INTEGER,
  "membershipHookKey" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationsRatePlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SessionGroup" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT,
  "guestCheckId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OperationsSession" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "groupId" TEXT,
  "guestCheckId" TEXT,
  "reservationId" TEXT,
  "ratePlanId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "totalPausedSeconds" INTEGER NOT NULL DEFAULT 0,
  "hourlyRateMinor" INTEGER NOT NULL,
  "overtimeRateMinor" INTEGER,
  "overtimeAfterMinutes" INTEGER,
  "roundingMinutes" INTEGER NOT NULL DEFAULT 1,
  "minimumMinutes" INTEGER NOT NULL DEFAULT 0,
  "capMinor" INTEGER,
  "rateSnapshot" JSONB NOT NULL,
  "accruedMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationsSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OperationsSessionPause" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "reason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsSessionPause_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SessionResourceLink" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unlinkedAt" TIMESTAMP(3),
  "actorUserId" TEXT NOT NULL,
  CONSTRAINT "SessionResourceLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResourceMaintenancePeriod" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceMaintenancePeriod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResourceStateEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "sessionId" TEXT,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceStateEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationsRatePlan_shopId_active_idx" ON "OperationsRatePlan"("shopId", "active");
CREATE INDEX "OperationsRatePlan_shopId_resourceId_active_idx" ON "OperationsRatePlan"("shopId", "resourceId", "active");
CREATE INDEX "OperationsRatePlan_shopId_resourceCategoryId_active_idx" ON "OperationsRatePlan"("shopId", "resourceCategoryId", "active");
CREATE INDEX "SessionGroup_shopId_createdAt_idx" ON "SessionGroup"("shopId", "createdAt");
CREATE INDEX "SessionGroup_shopId_guestCheckId_idx" ON "SessionGroup"("shopId", "guestCheckId");
CREATE INDEX "OperationsSession_shopId_status_resourceId_idx" ON "OperationsSession"("shopId", "status", "resourceId");
CREATE INDEX "OperationsSession_shopId_groupId_idx" ON "OperationsSession"("shopId", "groupId");
CREATE INDEX "OperationsSession_shopId_guestCheckId_idx" ON "OperationsSession"("shopId", "guestCheckId");
CREATE INDEX "OperationsSession_shopId_reservationId_idx" ON "OperationsSession"("shopId", "reservationId");
CREATE INDEX "OperationsSessionPause_shopId_sessionId_startedAt_idx" ON "OperationsSessionPause"("shopId", "sessionId", "startedAt");
CREATE INDEX "SessionResourceLink_shopId_sessionId_linkedAt_idx" ON "SessionResourceLink"("shopId", "sessionId", "linkedAt");
CREATE INDEX "SessionResourceLink_shopId_resourceId_unlinkedAt_idx" ON "SessionResourceLink"("shopId", "resourceId", "unlinkedAt");
CREATE INDEX "ResourceMaintenancePeriod_shopId_resourceId_endsAt_idx" ON "ResourceMaintenancePeriod"("shopId", "resourceId", "endsAt");
CREATE INDEX "ResourceStateEvent_shopId_resourceId_createdAt_idx" ON "ResourceStateEvent"("shopId", "resourceId", "createdAt");
CREATE INDEX "ResourceStateEvent_shopId_sessionId_createdAt_idx" ON "ResourceStateEvent"("shopId", "sessionId", "createdAt");
