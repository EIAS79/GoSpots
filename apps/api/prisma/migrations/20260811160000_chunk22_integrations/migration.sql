-- Chunk 22 — Integration Platform + GoPOS connector foundation (expand-only).

CREATE TYPE "ConnectorInstallationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISABLED');
CREATE TYPE "IntegrationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRY', 'DEAD');
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'RETRY', 'DEAD');
CREATE TYPE "WebhookReceiptStatus" AS ENUM ('RECEIVED', 'APPLIED', 'IGNORED', 'REJECTED');

CREATE TABLE "ConnectorInstallation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ConnectorInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
  "config" JSONB,
  "capabilities" JSONB,
  "secretCiphertext" TEXT,
  "secretIv" TEXT,
  "secretTag" TEXT,
  "secretKeyVersion" INTEGER NOT NULL DEFAULT 1,
  "lastHealthAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectorInstallation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectorInstallation_secret_complete" CHECK (
    ("secretCiphertext" IS NULL AND "secretIv" IS NULL AND "secretTag" IS NULL)
    OR ("secretCiphertext" IS NOT NULL AND "secretIv" IS NOT NULL AND "secretTag" IS NOT NULL)
  )
);

CREATE TABLE "ExternalReference" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "localType" TEXT NOT NULL,
  "localId" TEXT NOT NULL,
  "externalType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationMapping" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "mappingType" TEXT NOT NULL,
  "localKey" TEXT NOT NULL,
  "externalKey" TEXT NOT NULL,
  "config" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationJob" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "direction" "IntegrationDirection" NOT NULL,
  "jobType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "IntegrationJobStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "nextAttemptAt" TIMESTAMP(3),
  "correlationId" TEXT,
  "lastErrorCode" TEXT,
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationJob_maxAttempts_positive" CHECK ("maxAttempts" > 0),
  CONSTRAINT "IntegrationJob_attemptCount_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE TABLE "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "eventTypes" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "secretCiphertext" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretTag" TEXT NOT NULL,
  "secretKeyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastStatusCode" INTEGER,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDelivery_attemptCount_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE TABLE "IntegrationCredential" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookReceipt" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "signatureHash" TEXT NOT NULL,
  "status" "WebhookReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectorInstallation_shopId_provider_name_key" ON "ConnectorInstallation"("shopId", "provider", "name");
CREATE INDEX "ConnectorInstallation_shopId_status_provider_idx" ON "ConnectorInstallation"("shopId", "status", "provider");
CREATE UNIQUE INDEX "ExternalReference_installation_local_key" ON "ExternalReference"("installationId", "namespace", "localType", "localId");
CREATE UNIQUE INDEX "ExternalReference_installation_external_key" ON "ExternalReference"("installationId", "namespace", "externalType", "externalId");
CREATE INDEX "ExternalReference_shopId_localType_localId_idx" ON "ExternalReference"("shopId", "localType", "localId");
CREATE UNIQUE INDEX "IntegrationMapping_installation_mapping_local_key" ON "IntegrationMapping"("installationId", "mappingType", "localKey");
CREATE INDEX "IntegrationMapping_shopId_installationId_active_idx" ON "IntegrationMapping"("shopId", "installationId", "active");
CREATE UNIQUE INDEX "IntegrationJob_shop_installation_idempotency_key" ON "IntegrationJob"("shopId", "installationId", "idempotencyKey");
CREATE INDEX "IntegrationJob_shop_status_next_created_idx" ON "IntegrationJob"("shopId", "status", "nextAttemptAt", "createdAt");
CREATE INDEX "IntegrationJob_installation_status_created_idx" ON "IntegrationJob"("installationId", "status", "createdAt");
CREATE UNIQUE INDEX "WebhookEndpoint_shopId_name_key" ON "WebhookEndpoint"("shopId", "name");
CREATE INDEX "WebhookEndpoint_shopId_active_idx" ON "WebhookEndpoint"("shopId", "active");
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");
CREATE INDEX "WebhookDelivery_shop_status_next_created_idx" ON "WebhookDelivery"("shopId", "status", "nextAttemptAt", "createdAt");
CREATE UNIQUE INDEX "IntegrationCredential_tokenHash_key" ON "IntegrationCredential"("tokenHash");
CREATE UNIQUE INDEX "IntegrationCredential_shopId_name_key" ON "IntegrationCredential"("shopId", "name");
CREATE INDEX "IntegrationCredential_shop_active_expires_idx" ON "IntegrationCredential"("shopId", "active", "expiresAt");
CREATE INDEX "IntegrationCredential_tokenPrefix_idx" ON "IntegrationCredential"("tokenPrefix");
CREATE UNIQUE INDEX "WebhookReceipt_installationId_eventId_key" ON "WebhookReceipt"("installationId", "eventId");
CREATE INDEX "WebhookReceipt_shop_provider_received_idx" ON "WebhookReceipt"("shopId", "provider", "receivedAt");

ALTER TABLE "ConnectorInstallation" ADD CONSTRAINT "ConnectorInstallation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ConnectorInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationMapping" ADD CONSTRAINT "IntegrationMapping_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationMapping" ADD CONSTRAINT "IntegrationMapping_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ConnectorInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationJob" ADD CONSTRAINT "IntegrationJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationJob" ADD CONSTRAINT "IntegrationJob_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ConnectorInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookReceipt" ADD CONSTRAINT "WebhookReceipt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookReceipt" ADD CONSTRAINT "WebhookReceipt_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ConnectorInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['ConnectorInstallation','ExternalReference','IntegrationMapping','IntegrationJob','WebhookEndpoint','WebhookDelivery','IntegrationCredential','WebhookReceipt'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))', t || '_tenant_policy', t);
  END LOOP;
END $$;
