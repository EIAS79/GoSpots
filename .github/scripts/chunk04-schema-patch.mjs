import fs from 'node:fs';

const path = 'apps/api/prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf8');

function replaceOnce(anchor, replacement, label) {
  if (!schema.includes(anchor)) {
    throw new Error(`Chunk 04 schema patch anchor not found: ${label}`);
  }
  schema = schema.replace(anchor, replacement);
}

if (!schema.includes('enum CheckoutPaymentMethod {')) {
  replaceOnce(
    'enum CheckSettlementState {',
    `enum CheckoutPaymentMethod {\n  CASH\n  MANUAL_CARD\n  OTHER\n}\n\nenum CheckoutPaymentStatus {\n  PENDING\n  SUCCESS\n  FAILED\n  VOID\n}\n\nenum PaymentAllocationKind {\n  LINE\n  SOURCE\n  EQUAL\n  PERCENTAGE\n  CUSTOM\n  REMAINING\n}\n\nenum CheckSettlementState {`,
    'checkout enums',
  );
}

if (!schema.includes('checkoutPayments Payment[]')) {
  replaceOnce(
    '  checkSettlements CheckSettlement[]\n  chargeSnapshots ChargeSnapshot[]',
    '  checkSettlements CheckSettlement[]\n  chargeSnapshots ChargeSnapshot[]\n  checkoutPayments Payment[]\n  paymentAllocations PaymentAllocation[]\n  guestCheckMergeEvents GuestCheckMergeEvent[]',
    'Shop checkout relations',
  );
}

if (!schema.includes('mergedIntoCheckId String?')) {
  replaceOnce(
    '  currentSettlement   CheckSettlement? @relation("GuestCheckCurrentSettlement", fields: [currentSettlementId], references: [id], onDelete: SetNull)',
    '  currentSettlement   CheckSettlement? @relation("GuestCheckCurrentSettlement", fields: [currentSettlementId], references: [id], onDelete: SetNull)\n  /// Merge lineage: a source check can be absorbed into another open check.\n  mergedIntoCheckId String?\n  mergedIntoCheck   GuestCheck? @relation("GuestCheckMergeLineage", fields: [mergedIntoCheckId], references: [id], onDelete: SetNull)\n  mergedChecks      GuestCheck[] @relation("GuestCheckMergeLineage")',
    'GuestCheck merge lineage',
  );

  replaceOnce(
    '  settlements CheckSettlement[] @relation("GuestCheckSettlements")',
    '  settlements CheckSettlement[] @relation("GuestCheckSettlements")\n  mergeEventsAsSource GuestCheckMergeEvent[] @relation("GuestCheckMergeSource")\n  mergeEventsAsDestination GuestCheckMergeEvent[] @relation("GuestCheckMergeDestination")',
    'GuestCheck merge event relations',
  );

  replaceOnce(
    '  @@index([shopId, version])\n}',
    '  @@index([shopId, version])\n  @@index([mergedIntoCheckId])\n}',
    'GuestCheck merge index',
  );
}

if (!schema.includes('  payments        Payment[]')) {
  replaceOnce(
    '  snapshots      ChargeSnapshot[]',
    '  snapshots      ChargeSnapshot[]\n  payments        Payment[]\n  paymentAllocations PaymentAllocation[]',
    'CheckSettlement payment relations',
  );
}

if (!schema.includes('  allocations     PaymentAllocation[]')) {
  replaceOnce(
    '  pricingMetadata Json?\n  createdAt       DateTime        @default(now())',
    '  pricingMetadata Json?\n  createdAt       DateTime        @default(now())\n  allocations     PaymentAllocation[]',
    'ChargeSnapshot allocation relation',
  );
}

if (!schema.includes('model Payment {')) {
  schema += `\n\n/// Venue checkout payment recorded against one immutable settlement.\n/// Provider/terminal details are intentionally deferred to later payment connector chunks.\nmodel Payment {\n  id            String                @id @default(cuid())\n  shopId        String\n  shop          Shop                  @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  settlementId  String\n  settlement    CheckSettlement       @relation(fields: [settlementId], references: [id], onDelete: Restrict)\n  method        CheckoutPaymentMethod\n  status        CheckoutPaymentStatus @default(PENDING)\n  amount        Decimal               @db.Decimal(19, 4)\n  currency      String\n  note          String?\n  createdById   String?\n  correlationId String?\n  succeededAt   DateTime?\n  failedAt      DateTime?\n  createdAt     DateTime              @default(now())\n  updatedAt     DateTime              @updatedAt\n  allocations   PaymentAllocation[]\n\n  @@index([shopId, status, createdAt])\n  @@index([settlementId, status, createdAt])\n}\n\n/// Exact mapping between a checkout payment and immutable charge snapshots.\nmodel PaymentAllocation {\n  id             String                @id @default(cuid())\n  shopId         String\n  shop           Shop                  @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  paymentId      String\n  payment        Payment               @relation(fields: [paymentId], references: [id], onDelete: Cascade)\n  settlementId   String\n  settlement     CheckSettlement       @relation(fields: [settlementId], references: [id], onDelete: Restrict)\n  snapshotId     String\n  snapshot       ChargeSnapshot        @relation(fields: [snapshotId], references: [id], onDelete: Restrict)\n  allocationKind PaymentAllocationKind\n  amount         Decimal               @db.Decimal(19, 4)\n  quantity       Decimal               @default(0) @db.Decimal(19, 4)\n  sourceType     String?\n  sourceId       String?\n  createdAt      DateTime              @default(now())\n\n  @@unique([paymentId, snapshotId])\n  @@index([settlementId, snapshotId])\n  @@index([shopId, settlementId])\n}\n\n/// Durable audit lineage for a full GuestCheck merge.\nmodel GuestCheckMergeEvent {\n  id                     String     @id @default(cuid())\n  shopId                 String\n  shop                   Shop       @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  sourceCheckId          String\n  sourceCheck            GuestCheck @relation("GuestCheckMergeSource", fields: [sourceCheckId], references: [id], onDelete: Restrict)\n  destinationCheckId     String\n  destinationCheck       GuestCheck @relation("GuestCheckMergeDestination", fields: [destinationCheckId], references: [id], onDelete: Restrict)\n  actorId                String?\n  movedShopOrderIds      Json\n  movedPlaySessionIds    Json\n  movedReservationIds    Json\n  createdAt              DateTime   @default(now())\n\n  @@index([shopId, createdAt])\n  @@index([sourceCheckId, createdAt])\n  @@index([destinationCheckId, createdAt])\n}\n`;
}

fs.writeFileSync(path, schema);
