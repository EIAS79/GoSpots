import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const prefix = `p4_assert_${Date.now()}`;
const userId = `${prefix}_user`;
const shopId = `${prefix}_shop`;
const checkId = `${prefix}_check`;
const orderId = `${prefix}_order`;
const settlementId = `${prefix}_settlement`;
const paymentId = `${prefix}_payment`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PHASE4_ASSERT: ${message}`);
}

async function main() {
  const requiredTables = [
    'CommercialPolicy',
    'GuestCheckCommercialProfile',
    'CommercialAdjustment',
    'GuestCheckServiceCharge',
    'GuestCheckTip',
    'GuestCheckTransferEvent',
    'GuestCheckReopenEvent',
    'CommercialReceipt',
    'LedgerFactMetadata',
    'CommercialMergeEvent',
    'CommercialDayClose',
  ];
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN (${Prisma.join(requiredTables)})
  `;
  assert(tables.length === requiredTables.length, 'Phase 4 tables are incomplete');

  const orderVersion = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='VenueOrder' AND column_name='version'
  `;
  assert(orderVersion.length === 1, 'VenueOrder.version is missing');

  const triggerNames = [
    'phase4_shop_order_fact',
    'phase4_venue_order_fact',
    'phase4_operations_session_fact',
    'phase4_reservation_fact',
    'phase4_play_session_fact',
    'phase4_payment_fact',
    'phase4_cash_fact',
    'phase4_transaction_fact',
    'phase4_loss_fact',
    'phase4_stored_value_fact',
    'phase4_reservation_deposit_fact',
    'phase4_legacy_tip_fact',
    'phase4_settlement_close_facts',
  ];
  const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
    SELECT tgname FROM pg_trigger
    WHERE NOT tgisinternal AND tgname IN (${Prisma.join(triggerNames)})
  `;
  assert(triggers.length === triggerNames.length, 'Canonical ledger trigger set is incomplete');

  await prisma.user.create({
    data: {
      id: userId,
      email: `${prefix}@gospots.invalid`,
      name: 'Phase 4 Assert',
      passwordHash: 'not-a-real-password',
    },
  });
  await prisma.shop.create({
    data: {
      id: shopId,
      name: 'Phase 4 Assert Venue',
      slug: prefix,
      dashboardKey: `${prefix}_dashboard_key`,
      ownerId: userId,
      currency: 'PLN',
      timezone: 'Europe/Warsaw',
    },
  });
  await prisma.guestCheck.create({
    data: {
      id: checkId,
      shopId,
      status: 'OPEN',
      currency: 'PLN',
      openedById: userId,
    },
  });

  await prisma.venueOrder.create({
    data: {
      id: orderId,
      shopId,
      guestCheckId: checkId,
      serviceMode: 'COUNTER',
      status: 'COMPLETED',
      currency: 'PLN',
      subtotalMinor: 1000,
      taxMinor: 0,
      totalMinor: 1000,
      createdById: userId,
      completedAt: new Date(),
    },
  });

  const saleFacts = await prisma.ledgerFactMetadata.findMany({
    where: {
      shopId,
      factType: 'SALE',
      referenceType: 'VENUE_ORDER',
      referenceId: orderId,
    },
  });
  assert(saleFacts.length === 1, 'VenueOrder did not create exactly one canonical SALE fact');
  const saleLedger = await prisma.ledgerEntry.findUnique({
    where: { id: saleFacts[0].ledgerEntryId },
  });
  assert(saleLedger?.amount.eq(new Prisma.Decimal('10')), 'VenueOrder ledger amount is not authoritative totalMinor');
  assert(saleLedger?.guestCheckId === checkId, 'VenueOrder ledger fact lost GuestCheck lineage');

  await prisma.venueOrder.update({
    where: { id: orderId },
    data: { completedAt: new Date() },
  });
  const duplicateSales = await prisma.ledgerFactMetadata.count({
    where: { shopId, factType: 'SALE', referenceType: 'VENUE_ORDER', referenceId: orderId },
  });
  assert(duplicateSales === 1, 'VenueOrder ledger posting is not idempotent');

  await prisma.checkSettlement.create({
    data: {
      id: settlementId,
      shopId,
      guestCheckId: checkId,
      state: 'CALCULATED',
      checkVersion: 2,
      sourceHash: `${prefix}_hash`,
      subtotal: new Prisma.Decimal('10'),
      adjustments: new Prisma.Decimal('0'),
      taxAmount: new Prisma.Decimal('0'),
      depositAmount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('10'),
      amountDue: new Prisma.Decimal('10'),
      currency: 'PLN',
      createdById: userId,
    },
  });
  await prisma.payment.create({
    data: {
      id: paymentId,
      shopId,
      settlementId,
      method: 'CASH',
      status: 'SUCCESS',
      amount: new Prisma.Decimal('10'),
      currency: 'PLN',
      createdById: userId,
      succeededAt: new Date(),
    },
  });
  const paymentFact = await prisma.ledgerFactMetadata.findFirst({
    where: {
      shopId,
      factType: 'PAYMENT',
      referenceType: 'PAYMENT',
      referenceId: paymentId,
      settlementId,
    },
  });
  assert(paymentFact, 'Successful payment did not create canonical PAYMENT fact');
  const paymentLedger = await prisma.ledgerEntry.findUnique({
    where: { id: paymentFact.ledgerEntryId },
  });
  assert(paymentLedger?.amount.eq(new Prisma.Decimal('10')), 'Payment ledger amount diverges from Payment.amount');

  const duplicateLedgerKeys = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT "shopId","sourceType","sourceId","kind",COUNT(*)
      FROM "LedgerEntry"
      GROUP BY "shopId","sourceType","sourceId","kind"
      HAVING COUNT(*) > 1
    ) d
  `;
  assert(Number(duplicateLedgerKeys[0]?.count ?? 0) === 0, 'Ledger source uniqueness was violated');

  const orphanFacts = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "LedgerFactMetadata" m
    LEFT JOIN "LedgerEntry" l ON l."id"=m."ledgerEntryId"
    WHERE l."id" IS NULL
  `;
  assert(Number(orphanFacts[0]?.count ?? 0) === 0, 'LedgerFactMetadata contains orphan classifications');

  const arithmeticMismatches = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "CheckSettlement"
    WHERE abs("total" - ("subtotal" + "adjustments" + "taxAmount" - "depositAmount")) > 0.0001
  `;
  assert(Number(arithmeticMismatches[0]?.count ?? 0) === 0, 'Settlement arithmetic reconciliation failed');

  console.log('PHASE4_COMMERCIAL_ASSERT=PASS');
}

main()
  .finally(async () => {
    try {
      await prisma.shop.deleteMany({ where: { id: shopId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
