import fs from 'node:fs';

const schemaPath = 'apps/api/prisma/schema.prisma';
let schema = fs.readFileSync(schemaPath, 'utf8');

function replaceSchemaOnce(anchor, replacement, label) {
  if (!schema.includes(anchor)) {
    throw new Error(`Chunk 04 schema patch anchor not found: ${label}`);
  }
  schema = schema.replace(anchor, replacement);
}

if (!schema.includes('enum CheckoutPaymentMethod {')) {
  replaceSchemaOnce(
    'enum CheckSettlementState {',
    `enum CheckoutPaymentMethod {\n  CASH\n  MANUAL_CARD\n  OTHER\n}\n\nenum CheckoutPaymentStatus {\n  PENDING\n  SUCCESS\n  FAILED\n  VOID\n}\n\nenum PaymentAllocationKind {\n  LINE\n  SOURCE\n  EQUAL\n  PERCENTAGE\n  CUSTOM\n  REMAINING\n}\n\nenum CheckSettlementState {`,
    'checkout enums',
  );
}

if (!schema.includes('checkoutPayments Payment[]')) {
  replaceSchemaOnce(
    '  checkSettlements CheckSettlement[]\n  chargeSnapshots ChargeSnapshot[]',
    '  checkSettlements CheckSettlement[]\n  chargeSnapshots ChargeSnapshot[]\n  checkoutPayments Payment[]\n  paymentAllocations PaymentAllocation[]\n  guestCheckMergeEvents GuestCheckMergeEvent[]',
    'Shop checkout relations',
  );
}

if (!schema.includes('mergedIntoCheckId String?')) {
  replaceSchemaOnce(
    '  currentSettlement   CheckSettlement? @relation("GuestCheckCurrentSettlement", fields: [currentSettlementId], references: [id], onDelete: SetNull)',
    '  currentSettlement   CheckSettlement? @relation("GuestCheckCurrentSettlement", fields: [currentSettlementId], references: [id], onDelete: SetNull)\n  /// Merge lineage: a source check can be absorbed into another open check.\n  mergedIntoCheckId String?\n  mergedIntoCheck   GuestCheck? @relation("GuestCheckMergeLineage", fields: [mergedIntoCheckId], references: [id], onDelete: SetNull)\n  mergedChecks      GuestCheck[] @relation("GuestCheckMergeLineage")',
    'GuestCheck merge lineage',
  );
  replaceSchemaOnce(
    '  settlements CheckSettlement[] @relation("GuestCheckSettlements")',
    '  settlements CheckSettlement[] @relation("GuestCheckSettlements")\n  mergeEventsAsSource GuestCheckMergeEvent[] @relation("GuestCheckMergeSource")\n  mergeEventsAsDestination GuestCheckMergeEvent[] @relation("GuestCheckMergeDestination")',
    'GuestCheck merge event relations',
  );
  replaceSchemaOnce(
    '  @@index([shopId, version])\n}',
    '  @@index([shopId, version])\n  @@index([mergedIntoCheckId])\n}',
    'GuestCheck merge index',
  );
}

if (!schema.includes('  payments        Payment[]')) {
  replaceSchemaOnce(
    '  snapshots      ChargeSnapshot[]',
    '  snapshots      ChargeSnapshot[]\n  payments        Payment[]\n  paymentAllocations PaymentAllocation[]',
    'CheckSettlement payment relations',
  );
}

if (!schema.includes('  allocations     PaymentAllocation[]')) {
  replaceSchemaOnce(
    '  pricingMetadata Json?\n  createdAt       DateTime        @default(now())',
    '  pricingMetadata Json?\n  createdAt       DateTime        @default(now())\n  allocations     PaymentAllocation[]',
    'ChargeSnapshot allocation relation',
  );
}

if (!schema.includes('model Payment {')) {
  schema += `\n\n/// Venue checkout payment recorded against one immutable settlement.\n/// Provider/terminal details are intentionally deferred to later payment connector chunks.\nmodel Payment {\n  id            String                @id @default(cuid())\n  shopId        String\n  shop          Shop                  @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  settlementId  String\n  settlement    CheckSettlement       @relation(fields: [settlementId], references: [id], onDelete: Restrict)\n  method        CheckoutPaymentMethod\n  status        CheckoutPaymentStatus @default(PENDING)\n  amount        Decimal               @db.Decimal(19, 4)\n  currency      String\n  note          String?\n  createdById   String?\n  correlationId String?\n  succeededAt   DateTime?\n  failedAt      DateTime?\n  createdAt     DateTime              @default(now())\n  updatedAt     DateTime              @updatedAt\n  allocations   PaymentAllocation[]\n\n  @@index([shopId, status, createdAt])\n  @@index([settlementId, status, createdAt])\n}\n\n/// Exact mapping between a checkout payment and immutable charge snapshots.\nmodel PaymentAllocation {\n  id             String                @id @default(cuid())\n  shopId         String\n  shop           Shop                  @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  paymentId      String\n  payment        Payment               @relation(fields: [paymentId], references: [id], onDelete: Cascade)\n  settlementId   String\n  settlement     CheckSettlement       @relation(fields: [settlementId], references: [id], onDelete: Restrict)\n  snapshotId     String\n  snapshot       ChargeSnapshot        @relation(fields: [snapshotId], references: [id], onDelete: Restrict)\n  allocationKind PaymentAllocationKind\n  amount         Decimal               @db.Decimal(19, 4)\n  quantity       Decimal               @default(0) @db.Decimal(19, 4)\n  sourceType     String?\n  sourceId       String?\n  createdAt      DateTime              @default(now())\n\n  @@unique([paymentId, snapshotId])\n  @@index([settlementId, snapshotId])\n  @@index([shopId, settlementId])\n}\n\n/// Durable audit lineage for a full GuestCheck merge.\nmodel GuestCheckMergeEvent {\n  id                     String     @id @default(cuid())\n  shopId                 String\n  shop                   Shop       @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  sourceCheckId          String\n  sourceCheck            GuestCheck @relation("GuestCheckMergeSource", fields: [sourceCheckId], references: [id], onDelete: Restrict)\n  destinationCheckId     String\n  destinationCheck       GuestCheck @relation("GuestCheckMergeDestination", fields: [destinationCheckId], references: [id], onDelete: Restrict)\n  actorId                String?\n  movedShopOrderIds      Json\n  movedPlaySessionIds    Json\n  movedReservationIds    Json\n  createdAt              DateTime   @default(now())\n\n  @@index([shopId, createdAt])\n  @@index([sourceCheckId, createdAt])\n  @@index([destinationCheckId, createdAt])\n}\n`;
}

fs.writeFileSync(schemaPath, schema);

function patchTextFile(path, mutate) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutate(before);
  if (after !== before) fs.writeFileSync(path, after);
}

patchTextFile('apps/api/src/common/idempotency.util.ts', (source) => {
  if (source.includes('CHECKOUT_PAYMENT_CREATE:')) return source;
  const anchor = `  CHECKOUT_SETTLEMENT_CREATE: 'checkout.settlements.create',`;
  if (!source.includes(anchor)) throw new Error('idempotency scope anchor missing');
  return source.replace(
    anchor,
    `${anchor}\n  CHECKOUT_PAYMENT_CREATE: 'checkout.payments.create',\n  CHECKOUT_CHECK_MERGE: 'checkout.checks.merge',\n  CHECKOUT_CHARGES_MOVE: 'checkout.checks.move-charges',`,
  );
});

patchTextFile('apps/api/src/modules/checkout/checkout.module.ts', (source) => {
  if (source.includes('CheckoutPaymentService')) return source;
  source = source.replace(
    `import { SettlementStateService } from './settlement-state.service';`,
    `import { SettlementStateService } from './settlement-state.service';\nimport { PaymentAllocationService } from './payment-allocation.service';\nimport { CheckoutPaymentService } from './checkout-payment.service';\nimport { GuestCheckMergeService } from './guest-check-merge.service';`,
  );
  source = source.replace(
    `providers: [CheckoutService, ChargeCalculatorService, SettlementStateService],`,
    `providers: [\n    CheckoutService,\n    ChargeCalculatorService,\n    SettlementStateService,\n    PaymentAllocationService,\n    CheckoutPaymentService,\n    GuestCheckMergeService,\n  ],`,
  );
  source = source.replace(
    `exports: [CheckoutService, ChargeCalculatorService, SettlementStateService],`,
    `exports: [\n    CheckoutService,\n    ChargeCalculatorService,\n    SettlementStateService,\n    PaymentAllocationService,\n    CheckoutPaymentService,\n    GuestCheckMergeService,\n  ],`,
  );
  return source;
});

patchTextFile('apps/api/src/modules/foundation/feature-flag.service.ts', (source) => {
  if (source.includes(`['checkout_v2', 'checkout_split']`)) return source;
  const anchor = `const DEFAULT_ENABLED_FEATURES = new Set<FeatureKey>(['checkout_v2']);`;
  if (!source.includes(anchor)) throw new Error('feature default anchor missing');
  return source.replace(
    anchor,
    `const DEFAULT_ENABLED_FEATURES = new Set<FeatureKey>([\n  'checkout_v2',\n  'checkout_split',\n]);`,
  );
});
