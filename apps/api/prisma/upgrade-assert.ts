import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PHASE2_REQUIRED_CONSTRAINTS = [
  'Ticket_product_same_shop_fk',
  'Ticket_order_same_shop_fk',
  'TicketScan_ticket_same_shop_fk',
  'RfidCredential_wallet_same_shop_fk',
  'RfidWalletEntry_wallet_same_shop_fk',
  'RfidWalletEntry_reversal_same_shop_fk',
  'RfidTap_credential_same_shop_fk',
  'RfidTap_wallet_same_shop_fk',
  'AutomationExecution_rule_same_shop_fk',
  'AutomationStep_execution_same_shop_fk',
  'AutomationDead_execution_same_shop_fk',
  'AiInsightRun_snapshot_same_shop_fk',
  'AiInsight_run_same_shop_fk',
  'AiInsightFeedback_insight_same_shop_fk',
  'TicketProduct_price_nonnegative_ck',
  'TicketProduct_scan_count_ck',
  'TicketProduct_validity_ck',
  'TicketOrder_total_nonnegative_ck',
  'Ticket_scan_bounds_ck',
  'RfidWallet_balance_nonnegative_ck',
  'RfidWallet_version_nonnegative_ck',
  'RfidWalletEntry_balance_nonnegative_ck',
  'AutomationExecution_attempt_nonnegative_ck',
  'AutomationStep_index_nonnegative_ck',
  'AutomationDead_replay_nonnegative_ck',
  'AiInsightFeedback_rating_ck',
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Migration upgrade assertion failed: ${message}`);
}

async function main() {
  const [shop, membership, item, resource, reservation, transaction] = await Promise.all([
    prisma.shop.findUnique({ where: { id: 'upgrade-shop' } }),
    prisma.membership.findUnique({ where: { id: 'upgrade-membership' } }),
    prisma.menuItem.findUnique({ where: { id: 'upgrade-item' } }),
    prisma.resource.findUnique({ where: { id: 'upgrade-resource' } }),
    prisma.reservation.findUnique({ where: { id: 'upgrade-reservation' } }),
    prisma.transaction.findUnique({ where: { id: 'upgrade-transaction' } }),
  ]);

  invariant(shop?.currency === 'PLN', 'historical Shop/currency was not preserved');
  invariant(shop?.timezone === 'Europe/Warsaw', 'historical Shop timezone was not preserved');
  invariant(membership?.shopId === shop.id, 'historical Membership became orphaned');
  invariant(item?.shopId === shop.id, 'historical MenuItem became orphaned');
  invariant(resource?.shopId === shop.id, 'historical Resource became orphaned');
  invariant(reservation?.resourceId === resource.id, 'historical Reservation resource link was lost');
  invariant(transaction?.shopId === shop.id, 'historical Transaction became orphaned');
  invariant(transaction?.amount.toFixed(2) === '12.34', 'historical money amount changed');
  invariant(transaction?.currency === 'PLN', 'historical money currency changed');

  const sums = await prisma.transaction.aggregate({
    where: { shopId: shop.id },
    _sum: { amount: true },
  });
  invariant(sums._sum.amount?.toFixed(2) === '12.34', 'historical transaction total changed');

  const orphanRows = await prisma.$queryRaw<Array<{ orphan_count: bigint }>>`
    SELECT (
      (SELECT COUNT(*) FROM "Membership" m LEFT JOIN "Shop" s ON s.id = m."shopId" WHERE m.id = 'upgrade-membership' AND s.id IS NULL) +
      (SELECT COUNT(*) FROM "MenuItem" i LEFT JOIN "Shop" s ON s.id = i."shopId" WHERE i.id = 'upgrade-item' AND s.id IS NULL) +
      (SELECT COUNT(*) FROM "Resource" r LEFT JOIN "Shop" s ON s.id = r."shopId" WHERE r.id = 'upgrade-resource' AND s.id IS NULL) +
      (SELECT COUNT(*) FROM "Reservation" r LEFT JOIN "Shop" s ON s.id = r."shopId" WHERE r.id = 'upgrade-reservation' AND s.id IS NULL) +
      (SELECT COUNT(*) FROM "Transaction" t LEFT JOIN "Shop" s ON s.id = t."shopId" WHERE t.id = 'upgrade-transaction' AND s.id IS NULL)
    )::bigint AS orphan_count
  `;
  invariant(orphanRows[0]?.orphan_count === 0n, 'one or more representative historical rows are orphaned');

  const requiredTables = await prisma.$queryRaw<Array<{ name: string; present: boolean }>>`
    SELECT name, to_regclass('public."' || name || '"') IS NOT NULL AS present
    FROM (VALUES
      ('GuestCheck'),
      ('CheckSettlement'),
      ('Payment'),
      ('CashSession'),
      ('PaymentOperation'),
      ('Organization'),
      ('TicketOrder'),
      ('AutomationRule'),
      ('AiInsightRun')
    ) AS required(name)
  `;
  const missing = requiredTables.filter((row) => !row.present).map((row) => row.name);
  invariant(missing.length === 0, `current migration chain is missing tables: ${missing.join(', ')}`);

  const constraints = await prisma.$queryRaw<Array<{ conname: string; contype: string }>>`
    SELECT conname, contype FROM pg_constraint
  `;
  const byConstraint = new Map(
    constraints.map((constraint) => [constraint.conname, constraint]),
  );
  const missingConstraints = PHASE2_REQUIRED_CONSTRAINTS.filter(
    (name) => !byConstraint.has(name),
  );
  invariant(
    missingConstraints.length === 0,
    `Phase 2 DB constraints missing after upgrade: ${missingConstraints.join(', ')}`,
  );
  const wrongType = PHASE2_REQUIRED_CONSTRAINTS.map((name) =>
    byConstraint.get(name),
  ).filter(
    (constraint) =>
      constraint && constraint.contype !== 'f' && constraint.contype !== 'c',
  );
  invariant(
    wrongType.length === 0,
    `Phase 2 constraints have unexpected types: ${wrongType
      .map((constraint) => `${constraint!.conname}:${constraint!.contype}`)
      .join(', ')}`,
  );

  console.log('Migration-upgrade and Phase 2 integrity assertions passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
