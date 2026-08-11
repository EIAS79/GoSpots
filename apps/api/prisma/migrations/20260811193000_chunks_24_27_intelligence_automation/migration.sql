CREATE TYPE "TicketStatus" AS ENUM ('ISSUED','ACTIVE','REDEEMED','VOIDED','EXPIRED');
CREATE TYPE "TicketOrderStatus" AS ENUM ('OPEN','PAID','VOIDED','REFUNDED');
CREATE TYPE "RfidCredentialStatus" AS ENUM ('ACTIVE','SUSPENDED','REVOKED');
CREATE TYPE "RfidWalletEntryType" AS ENUM ('LOAD','SPEND','REFUND','REVERSAL','ADJUSTMENT');
CREATE TYPE "TicketScanResult" AS ENUM ('ACCEPTED','DUPLICATE','EXPIRED','VOIDED','REJECTED');
CREATE TYPE "RfidTapAction" AS ENUM ('IDENTIFY','BALANCE','SPEND','LOAD');
CREATE TYPE "AutomationTriggerType" AS ENUM ('MANUAL','DOMAIN_EVENT','SCHEDULED');
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD_LETTER','SKIPPED');
CREATE TYPE "AutomationStepStatus" AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED');
CREATE TYPE "AiInsightRunStatus" AS ENUM ('RUNNING','SUCCEEDED','DEGRADED','FAILED');
CREATE TYPE "AiInsightSeverity" AS ENUM ('INFO','OPPORTUNITY','WARNING','CRITICAL');

CREATE TABLE "TicketProduct" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "name" TEXT NOT NULL, "sku" TEXT,
  "priceMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "validityMinutes" INTEGER,
  "maxScans" INTEGER NOT NULL DEFAULT 1, "active" BOOLEAN NOT NULL DEFAULT true, "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketProduct_shopId_name_key" ON "TicketProduct"("shopId","name");
CREATE UNIQUE INDEX "TicketProduct_shopId_sku_key" ON "TicketProduct"("shopId","sku");
CREATE INDEX "TicketProduct_shopId_active_updatedAt_idx" ON "TicketProduct"("shopId","active","updatedAt");

CREATE TABLE "TicketOrder" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "status" "TicketOrderStatus" NOT NULL DEFAULT 'OPEN', "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR', "customerRefHash" TEXT, "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketOrder_shopId_idempotencyKey_key" ON "TicketOrder"("shopId","idempotencyKey");
CREATE INDEX "TicketOrder_shopId_status_createdAt_idx" ON "TicketOrder"("shopId","status","createdAt");

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "orderId" TEXT, "productId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED', "scansUsed" INTEGER NOT NULL DEFAULT 0,
  "maxScans" INTEGER NOT NULL DEFAULT 1, "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3), "redeemedAt" TIMESTAMP(3), "voidedAt" TIMESTAMP(3), "lastScannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Ticket_tokenHash_key" ON "Ticket"("tokenHash");
CREATE INDEX "Ticket_shopId_productId_status_idx" ON "Ticket"("shopId","productId","status");
CREATE INDEX "Ticket_shopId_orderId_createdAt_idx" ON "Ticket"("shopId","orderId","createdAt");
CREATE INDEX "Ticket_shopId_expiresAt_idx" ON "Ticket"("shopId","expiresAt");

CREATE TABLE "TicketScan" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "ticketId" TEXT, "presentedHash" TEXT NOT NULL,
  "result" "TicketScanResult" NOT NULL, "scannerDeviceId" TEXT, "idempotencyKey" TEXT NOT NULL,
  "reasonCode" TEXT, "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketScan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketScan_shopId_idempotencyKey_key" ON "TicketScan"("shopId","idempotencyKey");
CREATE INDEX "TicketScan_shopId_ticketId_scannedAt_idx" ON "TicketScan"("shopId","ticketId","scannedAt");
CREATE INDEX "TicketScan_shopId_presentedHash_scannedAt_idx" ON "TicketScan"("shopId","presentedHash","scannedAt");

CREATE TABLE "RfidWallet" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "label" TEXT, "customerRefHash" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'EUR', "balanceMinor" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RfidWallet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RfidWallet_shopId_active_updatedAt_idx" ON "RfidWallet"("shopId","active","updatedAt");
CREATE INDEX "RfidWallet_shopId_customerRefHash_idx" ON "RfidWallet"("shopId","customerRefHash");

CREATE TABLE "RfidCredential" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "uidHash" TEXT NOT NULL, "walletId" TEXT NOT NULL,
  "label" TEXT, "status" "RfidCredentialStatus" NOT NULL DEFAULT 'ACTIVE', "lastTapAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RfidCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RfidCredential_shopId_uidHash_key" ON "RfidCredential"("shopId","uidHash");
CREATE INDEX "RfidCredential_shopId_walletId_status_idx" ON "RfidCredential"("shopId","walletId","status");

CREATE TABLE "RfidWalletEntry" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "walletId" TEXT NOT NULL, "type" "RfidWalletEntryType" NOT NULL,
  "amountMinor" INTEGER NOT NULL, "balanceAfterMinor" INTEGER NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "referenceType" TEXT, "referenceId" TEXT, "reversalOfId" TEXT, "actorUserId" TEXT, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RfidWalletEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RfidWalletEntry_shopId_idempotencyKey_key" ON "RfidWalletEntry"("shopId","idempotencyKey");
CREATE UNIQUE INDEX "RfidWalletEntry_shopId_reversalOfId_key" ON "RfidWalletEntry"("shopId","reversalOfId");
CREATE INDEX "RfidWalletEntry_shopId_walletId_createdAt_idx" ON "RfidWalletEntry"("shopId","walletId","createdAt");
CREATE INDEX "RfidWalletEntry_shopId_referenceType_referenceId_idx" ON "RfidWalletEntry"("shopId","referenceType","referenceId");

CREATE TABLE "RfidTap" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "credentialId" TEXT, "uidHash" TEXT NOT NULL, "walletId" TEXT,
  "action" "RfidTapAction" NOT NULL, "amountMinor" INTEGER, "result" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "deviceId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RfidTap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RfidTap_shopId_idempotencyKey_key" ON "RfidTap"("shopId","idempotencyKey");
CREATE INDEX "RfidTap_shopId_credentialId_createdAt_idx" ON "RfidTap"("shopId","credentialId","createdAt");
CREATE INDEX "RfidTap_shopId_uidHash_createdAt_idx" ON "RfidTap"("shopId","uidHash","createdAt");

CREATE TABLE "AutomationRule" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "triggerType" "AutomationTriggerType" NOT NULL, "triggerConfigJson" TEXT, "conditionJson" TEXT, "actionsJson" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "nextRunAt" TIMESTAMP(3), "lastTriggeredAt" TIMESTAMP(3), "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationRule_shopId_name_key" ON "AutomationRule"("shopId","name");
CREATE INDEX "AutomationRule_shopId_enabled_triggerType_idx" ON "AutomationRule"("shopId","enabled","triggerType");
CREATE INDEX "AutomationRule_shopId_nextRunAt_idx" ON "AutomationRule"("shopId","nextRunAt");

CREATE TABLE "AutomationExecution" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "ruleId" TEXT, "triggerType" "AutomationTriggerType" NOT NULL,
  "triggerRef" TEXT, "dedupeKey" TEXT NOT NULL, "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt" INTEGER NOT NULL DEFAULT 0, "inputHash" TEXT NOT NULL, "inputJson" TEXT, "outputJson" TEXT,
  "errorCode" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationExecution_shopId_dedupeKey_key" ON "AutomationExecution"("shopId","dedupeKey");
CREATE INDEX "AutomationExecution_shopId_ruleId_createdAt_idx" ON "AutomationExecution"("shopId","ruleId","createdAt");
CREATE INDEX "AutomationExecution_shopId_status_updatedAt_idx" ON "AutomationExecution"("shopId","status","updatedAt");

CREATE TABLE "AutomationExecutionStep" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "executionId" TEXT NOT NULL, "stepIndex" INTEGER NOT NULL,
  "actionType" TEXT NOT NULL, "status" "AutomationStepStatus" NOT NULL DEFAULT 'PENDING', "inputHash" TEXT,
  "outputJson" TEXT, "errorCode" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationExecutionStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationExecutionStep_executionId_stepIndex_key" ON "AutomationExecutionStep"("executionId","stepIndex");
CREATE INDEX "AutomationExecutionStep_shopId_executionId_stepIndex_idx" ON "AutomationExecutionStep"("shopId","executionId","stepIndex");
CREATE INDEX "AutomationExecutionStep_shopId_status_updatedAt_idx" ON "AutomationExecutionStep"("shopId","status","updatedAt");

CREATE TABLE "AutomationDeadLetter" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "executionId" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "replayCount" INTEGER NOT NULL DEFAULT 0, "lastReplayAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationDeadLetter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationDeadLetter_shopId_executionId_key" ON "AutomationDeadLetter"("shopId","executionId");
CREATE INDEX "AutomationDeadLetter_shopId_resolvedAt_createdAt_idx" ON "AutomationDeadLetter"("shopId","resolvedAt","createdAt");

CREATE TABLE "InsightSnapshot" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "windowEnd" TIMESTAMP(3) NOT NULL,
  "metricsJson" TEXT NOT NULL, "metricsHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InsightSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InsightSnapshot_shopId_windowStart_windowEnd_metricsHash_key" ON "InsightSnapshot"("shopId","windowStart","windowEnd","metricsHash");
CREATE INDEX "InsightSnapshot_shopId_windowEnd_createdAt_idx" ON "InsightSnapshot"("shopId","windowEnd","createdAt");

CREATE TABLE "AiInsightRun" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "provider" TEXT NOT NULL, "model" TEXT,
  "status" "AiInsightRunStatus" NOT NULL DEFAULT 'RUNNING', "inputHash" TEXT NOT NULL, "outputHash" TEXT,
  "failureCode" TEXT, "failureMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "AiInsightRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiInsightRun_shopId_snapshotId_provider_inputHash_key" ON "AiInsightRun"("shopId","snapshotId","provider","inputHash");
CREATE INDEX "AiInsightRun_shopId_status_createdAt_idx" ON "AiInsightRun"("shopId","status","createdAt");

CREATE TABLE "AiInsight" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "runId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "type" TEXT NOT NULL,
  "severity" "AiInsightSeverity" NOT NULL DEFAULT 'INFO', "title" TEXT NOT NULL, "body" TEXT NOT NULL, "evidenceJson" TEXT NOT NULL,
  "actionKey" TEXT, "dismissedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiInsight_shopId_fingerprint_key" ON "AiInsight"("shopId","fingerprint");
CREATE INDEX "AiInsight_shopId_runId_createdAt_idx" ON "AiInsight"("shopId","runId","createdAt");
CREATE INDEX "AiInsight_shopId_severity_dismissedAt_idx" ON "AiInsight"("shopId","severity","dismissedAt");

CREATE TABLE "AiInsightFeedback" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "insightId" TEXT NOT NULL, "actorId" TEXT, "rating" INTEGER NOT NULL,
  "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiInsightFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiInsightFeedback_shopId_insightId_actorId_key" ON "AiInsightFeedback"("shopId","insightId","actorId");
CREATE INDEX "AiInsightFeedback_shopId_insightId_createdAt_idx" ON "AiInsightFeedback"("shopId","insightId","createdAt");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'TicketProduct','TicketOrder','Ticket','TicketScan','RfidWallet','RfidCredential','RfidWalletEntry','RfidTap',
    'AutomationRule','AutomationExecution','AutomationExecutionStep','AutomationDeadLetter',
    'InsightSnapshot','AiInsightRun','AiInsight','AiInsightFeedback'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))', t || '_tenant_policy', t);
  END LOOP;
END $$;
