-- Chunk 01 — Cross-cutting engineering foundation (expand-only).
-- Adds durable per-Shop rollout flags and a generic transactional domain-event outbox.

CREATE TABLE "ShopFeatureFlag" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopFeatureFlag_shopId_feature_key"
    ON "ShopFeatureFlag"("shopId", "feature");
CREATE INDEX "ShopFeatureFlag_feature_enabled_idx"
    ON "ShopFeatureFlag"("feature", "enabled");

ALTER TABLE "ShopFeatureFlag"
    ADD CONSTRAINT "ShopFeatureFlag_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DomainEventOutbox" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DomainEventOutbox_shopId_status_occurredAt_idx"
    ON "DomainEventOutbox"("shopId", "status", "occurredAt");
CREATE INDEX "DomainEventOutbox_aggregateType_aggregateId_occurredAt_idx"
    ON "DomainEventOutbox"("aggregateType", "aggregateId", "occurredAt");
CREATE INDEX "DomainEventOutbox_status_occurredAt_idx"
    ON "DomainEventOutbox"("status", "occurredAt");

ALTER TABLE "DomainEventOutbox"
    ADD CONSTRAINT "DomainEventOutbox_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tier-A tenant isolation consistent with the existing gradual RLS posture.
ALTER TABLE "ShopFeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShopFeatureFlag" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ShopFeatureFlag_tenant_isolation" ON "ShopFeatureFlag"
    FOR ALL
    USING (app_tenant_rls_ok("shopId"))
    WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "DomainEventOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DomainEventOutbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DomainEventOutbox_tenant_isolation" ON "DomainEventOutbox"
    FOR ALL
    USING (app_tenant_rls_ok("shopId"))
    WITH CHECK (app_tenant_rls_ok("shopId"));
