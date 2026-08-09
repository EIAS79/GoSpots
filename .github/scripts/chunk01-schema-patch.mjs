import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/api/prisma/schema.prisma';
let schema = readFileSync(path, 'utf8');

const shopAnchor = '  billingNotificationDeliveries BillingNotificationDelivery[]\n';
const shopRelations = `${shopAnchor}  featureFlags ShopFeatureFlag[]\n  domainEventOutbox DomainEventOutbox[]\n`;

if (!schema.includes('  featureFlags ShopFeatureFlag[]')) {
  if (!schema.includes(shopAnchor)) {
    throw new Error('Chunk 01 schema patch: Shop relation anchor not found');
  }
  schema = schema.replace(shopAnchor, shopRelations);
}

const membershipMarker = '// ─────────────────────────────────────────────────────────────────\n// MEMBERSHIP — User ↔ Shop with role and granular permissions\n';
const models = `/// Per-Shop rollout override. Missing row means disabled unless development fallback is explicitly enabled.\nmodel ShopFeatureFlag {\n  id        String   @id @default(cuid())\n  shopId    String\n  shop      Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  feature   String\n  enabled   Boolean  @default(false)\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  @@unique([shopId, feature])\n  @@index([feature, enabled])\n}\n\n/// Durable application-domain event outbox. Created in the same DB transaction as aggregate mutations.\n/// Status: PENDING | PROCESSING | PROCESSED | FAILED | DEAD.\nmodel DomainEventOutbox {\n  id            String   @id @default(cuid())\n  shopId        String\n  shop          Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  aggregateType String\n  aggregateId   String\n  eventType     String\n  payload       Json\n  occurredAt    DateTime @default(now())\n  status        String   @default(\"PENDING\")\n  attemptCount  Int      @default(0)\n  lastError     String?\n  processedAt   DateTime?\n  createdAt     DateTime @default(now())\n  updatedAt     DateTime @updatedAt\n\n  @@index([shopId, status, occurredAt])\n  @@index([aggregateType, aggregateId, occurredAt])\n  @@index([status, occurredAt])\n}\n\n`;

if (!schema.includes('model ShopFeatureFlag {')) {
  if (!schema.includes(membershipMarker)) {
    throw new Error('Chunk 01 schema patch: model insertion anchor not found');
  }
  schema = schema.replace(membershipMarker, models + membershipMarker);
}

writeFileSync(path, schema);
