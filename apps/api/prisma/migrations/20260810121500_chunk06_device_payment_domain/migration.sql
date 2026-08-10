-- Chunk 06 — Device Registry + Payment Domain Hardening (expand-only).
-- Provider-neutral payment/device foundation. No real provider credentials or Checkout provider branching.

CREATE TYPE "DeviceType" AS ENUM ('POS', 'PAYMENT_TERMINAL', 'EDGE_HUB', 'PRINTER', 'KDS');
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PaymentOperationState" AS ENUM (
  'CREATED', 'PROCESSING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED',
  'FAILED', 'CANCELED', 'UNKNOWN', 'PARTIALLY_REFUNDED', 'REFUNDED'
);
CREATE TYPE "RefundState" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN');
CREATE TYPE "PaymentWebhookStatus" AS ENUM ('RECEIVED', 'APPLIED', 'IGNORED');

CREATE TABLE "Device" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "DeviceType" NOT NULL,
  "provider" TEXT,
  "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentTerminal" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalTerminalId" TEXT,
  "capabilities" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentTerminal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOperation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "settlementId" TEXT,
  "checkoutPaymentId" TEXT,
  "terminalId" TEXT,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "state" "PaymentOperationState" NOT NULL DEFAULT 'CREATED',
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  "providerPayload" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdById" TEXT,
  "capturedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentOperation_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "paymentOperationId" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "state" "RefundState" NOT NULL DEFAULT 'CREATED',
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT,
  "providerPayload" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdById" TEXT,
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "RefundAllocation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "paymentAllocationId" TEXT,
  "snapshotId" TEXT,
  "amount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundAllocation_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "RefundAllocation_lineage_present" CHECK ("paymentAllocationId" IS NOT NULL OR "snapshotId" IS NOT NULL)
);

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT,
  "payloadHash" TEXT NOT NULL,
  "paymentOperationId" TEXT,
  "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Device_shopId_label_key" ON "Device"("shopId", "label");
CREATE INDEX "Device_shopId_type_status_idx" ON "Device"("shopId", "type", "status");
CREATE INDEX "Device_shopId_lastSeenAt_idx" ON "Device"("shopId", "lastSeenAt");

CREATE UNIQUE INDEX "PaymentTerminal_deviceId_key" ON "PaymentTerminal"("deviceId");
CREATE UNIQUE INDEX "PaymentTerminal_shopId_provider_externalTerminalId_key"
  ON "PaymentTerminal"("shopId", "provider", "externalTerminalId");
CREATE INDEX "PaymentTerminal_shopId_provider_enabled_idx"
  ON "PaymentTerminal"("shopId", "provider", "enabled");

CREATE UNIQUE INDEX "PaymentOperation_shopId_provider_idempotencyKey_key"
  ON "PaymentOperation"("shopId", "provider", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentOperation_shopId_provider_providerPaymentId_key"
  ON "PaymentOperation"("shopId", "provider", "providerPaymentId");
CREATE INDEX "PaymentOperation_shopId_state_createdAt_idx"
  ON "PaymentOperation"("shopId", "state", "createdAt");
CREATE INDEX "PaymentOperation_shopId_settlementId_createdAt_idx"
  ON "PaymentOperation"("shopId", "settlementId", "createdAt");
CREATE INDEX "PaymentOperation_checkoutPaymentId_idx" ON "PaymentOperation"("checkoutPaymentId");
CREATE INDEX "PaymentOperation_terminalId_idx" ON "PaymentOperation"("terminalId");

CREATE UNIQUE INDEX "Refund_shopId_paymentOperationId_idempotencyKey_key"
  ON "Refund"("shopId", "paymentOperationId", "idempotencyKey");
CREATE UNIQUE INDEX "Refund_shopId_providerRefundId_key"
  ON "Refund"("shopId", "providerRefundId");
CREATE INDEX "Refund_shopId_state_createdAt_idx" ON "Refund"("shopId", "state", "createdAt");
CREATE INDEX "Refund_paymentOperationId_createdAt_idx" ON "Refund"("paymentOperationId", "createdAt");

CREATE INDEX "RefundAllocation_shopId_refundId_idx" ON "RefundAllocation"("shopId", "refundId");
CREATE INDEX "RefundAllocation_paymentAllocationId_idx" ON "RefundAllocation"("paymentAllocationId");
CREATE INDEX "RefundAllocation_snapshotId_idx" ON "RefundAllocation"("snapshotId");

CREATE UNIQUE INDEX "PaymentWebhookEvent_shopId_provider_eventId_key"
  ON "PaymentWebhookEvent"("shopId", "provider", "eventId");
CREATE INDEX "PaymentWebhookEvent_shopId_status_receivedAt_idx"
  ON "PaymentWebhookEvent"("shopId", "status", "receivedAt");
CREATE INDEX "PaymentWebhookEvent_paymentOperationId_idx"
  ON "PaymentWebhookEvent"("paymentOperationId");

ALTER TABLE "Device" ADD CONSTRAINT "Device_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTerminal" ADD CONSTRAINT "PaymentTerminal_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTerminal" ADD CONSTRAINT "PaymentTerminal_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_checkoutPaymentId_fkey"
  FOREIGN KEY ("checkoutPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_terminalId_fkey"
  FOREIGN KEY ("terminalId") REFERENCES "PaymentTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentOperationId_fkey"
  FOREIGN KEY ("paymentOperationId") REFERENCES "PaymentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_paymentAllocationId_fkey"
  FOREIGN KEY ("paymentAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "ChargeSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentOperationId_fkey"
  FOREIGN KEY ("paymentOperationId") REFERENCES "PaymentOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Device_tenant_policy" ON "Device"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "PaymentTerminal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentTerminal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PaymentTerminal_tenant_policy" ON "PaymentTerminal"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "PaymentOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentOperation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PaymentOperation_tenant_policy" ON "PaymentOperation"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Refund_tenant_policy" ON "Refund"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "RefundAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RefundAllocation_tenant_policy" ON "RefundAllocation"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "PaymentWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentWebhookEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PaymentWebhookEvent_tenant_policy" ON "PaymentWebhookEvent"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
