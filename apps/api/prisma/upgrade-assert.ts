import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Phase 1 upgrade assertion failed: ${message}`);
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

  console.log('Phase 1 migration-upgrade assertions passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
