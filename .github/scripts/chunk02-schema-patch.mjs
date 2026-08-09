import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/api/prisma/schema.prisma';
let schema = readFileSync(path, 'utf8');

const shopAnchor = '  domainEventOutbox DomainEventOutbox[]\n';
if (!schema.includes('  checkSettlements CheckSettlement[]')) {
  if (!schema.includes(shopAnchor)) throw new Error('Shop relation anchor not found');
  schema = schema.replace(
    shopAnchor,
    `${shopAnchor}  checkSettlements CheckSettlement[]\n  chargeSnapshots ChargeSnapshot[]\n`,
  );
}

const guestScalarAnchor = '  updatedAt     DateTime         @updatedAt\n\n  shopOrders   ShopOrder[]\n';
if (!schema.includes('  currentSettlementId String?')) {
  if (!schema.includes(guestScalarAnchor)) {
    throw new Error('GuestCheck scalar anchor not found');
  }
  schema = schema.replace(
    guestScalarAnchor,
    '  updatedAt     DateTime         @updatedAt\n  /// Optimistic concurrency token for checkout-sensitive GuestCheck mutations.\n  version       Int              @default(1)\n  /// Current immutable checkout snapshot; legacy GuestCheck settlement remains unchanged.\n  currentSettlementId String?    @unique\n  currentSettlement   CheckSettlement? @relation("GuestCheckCurrentSettlement", fields: [currentSettlementId], references: [id], onDelete: SetNull)\n\n  shopOrders   ShopOrder[]\n',
  );
}

const guestRelationAnchor = '  ledgerEntries LedgerEntry[]\n\n  @@index([shopId, status, openedAt])\n';
if (!schema.includes('  settlements CheckSettlement[] @relation("GuestCheckSettlements")')) {
  if (!schema.includes(guestRelationAnchor)) {
    throw new Error('GuestCheck relation anchor not found');
  }
  schema = schema.replace(
    guestRelationAnchor,
    '  ledgerEntries LedgerEntry[]\n  settlements CheckSettlement[] @relation("GuestCheckSettlements")\n\n  @@index([shopId, status, openedAt])\n  @@index([shopId, version])\n',
  );
}

const modelAnchor = '/// Walk-in or linked booking: billiard, PC, tables — players, duration, price.\n';
const models = `enum CheckSettlementState {\n  OPEN\n  CALCULATED\n  PARTIALLY_PAID\n  PAID\n  CLOSED\n  VOID\n}\n\n/// Immutable checkout calculation for a GuestCheck. No tender/provider charge is created here.\nmodel CheckSettlement {\n  id             String               @id @default(cuid())\n  shopId         String\n  shop           Shop                 @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  guestCheckId   String\n  guestCheck     GuestCheck           @relation("GuestCheckSettlements", fields: [guestCheckId], references: [id], onDelete: Restrict)\n  currentForCheck GuestCheck?         @relation("GuestCheckCurrentSettlement")\n  state          CheckSettlementState @default(CALCULATED)\n  checkVersion   Int\n  sourceHash     String\n  subtotal       Decimal              @db.Decimal(19, 4)\n  adjustments    Decimal              @default(0) @db.Decimal(19, 4)\n  taxAmount      Decimal              @default(0) @db.Decimal(19, 4)\n  depositAmount  Decimal              @default(0) @db.Decimal(19, 4)\n  total          Decimal              @db.Decimal(19, 4)\n  amountDue      Decimal              @db.Decimal(19, 4)\n  currency       String\n  createdById    String?\n  createdAt      DateTime             @default(now())\n  updatedAt      DateTime             @updatedAt\n  snapshots      ChargeSnapshot[]\n\n  @@index([guestCheckId, sourceHash])\n  @@unique([guestCheckId, checkVersion])\n  @@index([shopId, state, createdAt])\n  @@index([shopId, guestCheckId, createdAt])\n}\n\n/// Frozen settlement line. Rows are append-only after settlement creation.\nmodel ChargeSnapshot {\n  id              String          @id @default(cuid())\n  shopId          String\n  shop            Shop            @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  settlementId    String\n  settlement      CheckSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)\n  position        Int             @default(0)\n  sourceType      String\n  sourceId        String\n  lineReference   String?\n  description     String\n  quantity        Int             @default(1)\n  unitAmount      Decimal         @db.Decimal(19, 4)\n  grossAmount     Decimal         @db.Decimal(19, 4)\n  discountAmount  Decimal         @default(0) @db.Decimal(19, 4)\n  finalAmount     Decimal         @db.Decimal(19, 4)\n  currency        String\n  pricingMetadata Json?\n  createdAt       DateTime        @default(now())\n\n  @@index([settlementId, position])\n  @@index([shopId, sourceType, sourceId])\n}\n\n`;

if (!schema.includes('model CheckSettlement {')) {
  if (!schema.includes(modelAnchor)) throw new Error('Settlement model anchor not found');
  schema = schema.replace(modelAnchor, models + modelAnchor);
}

schema = schema.replace(
  '  @@unique([guestCheckId, sourceHash])\n',
  '  @@index([guestCheckId, sourceHash])\n',
);

writeFileSync(path, schema);
