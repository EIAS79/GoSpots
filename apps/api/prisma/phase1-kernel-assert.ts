import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('Shop', 'businessDayStartMinutes'),
        ('Shop', 'version'),
        ('IdempotencyReceipt', 'correlationId'),
        ('DomainEventOutbox', 'correlationId'),
        ('DomainEventOutbox', 'nextAttemptAt'),
        ('AuditLog', 'correlationId'),
        ('AuditLog', 'sourceDevice'),
        ('AuditLog', 'previousState'),
        ('AuditLog', 'newState'),
        ('Reservation', 'version'),
        ('Stocktake', 'version'),
        ('RfidCredential', 'version')
      )
  `;
  if (columns.length !== 12) throw new Error(`Phase 1 kernel columns missing: found ${columns.length}/12`);

  const roles = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT enumlabel
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'ShopRole'
  `;
  const roleSet = new Set(roles.map((row) => row.enumlabel));
  for (const role of ['OWNER', 'MANAGER', 'SUPERVISOR', 'CASHIER', 'SERVER', 'KITCHEN', 'INVENTORY', 'VIEWER']) {
    if (!roleSet.has(role)) throw new Error(`Missing ShopRole ${role}`);
  }

  const constraints = await prisma.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
    SELECT conname, convalidated FROM pg_constraint
    WHERE conname IN (
      'Shop_businessDayStartMinutes_check',
      'Shop_version_check',
      'IdempotencyReceipt_shopId_fkey',
      'DomainEventConsumerReceipt_shopId_fkey',
      'DomainEventConsumerReceipt_shopId_eventId_fkey',
      'GuestCheck_version_check',
      'OperationsSession_version_check',
      'AutomationRule_version_check',
      'Reservation_version_check',
      'Stocktake_version_check',
      'RfidCredential_version_check'
    )
  `;
  if (constraints.length !== 11) {
    throw new Error(`Phase 1 kernel constraints missing: found ${constraints.length}/11`);
  }
  const unvalidated = constraints.filter((row) => !row.convalidated);
  if (unvalidated.length) {
    throw new Error(`Phase 1 kernel constraints remain unvalidated: ${unvalidated.map((row) => row.conname).join(', ')}`);
  }

  const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
    SELECT tgname FROM pg_trigger
    WHERE tgname = 'AuditLog_reject_delete' AND NOT tgisinternal
  `;
  if (triggers.length !== 1) throw new Error('Immutable AuditLog trigger missing');

  const badBusinessDays = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "Shop"
    WHERE "businessDayStartMinutes" < 0 OR "businessDayStartMinutes" >= 1440
  `;
  if (Number(badBusinessDays[0]?.count ?? 0) !== 0) {
    throw new Error('Invalid business-day values survived migration');
  }

  const badVersions = await prisma.$queryRaw<Array<{ aggregate: string; count: bigint }>>`
    SELECT 'GuestCheck' AS aggregate, COUNT(*)::bigint AS count FROM "GuestCheck" WHERE "version" < 1
    UNION ALL SELECT 'OperationsSession', COUNT(*)::bigint FROM "OperationsSession" WHERE "version" < 1
    UNION ALL SELECT 'AutomationRule', COUNT(*)::bigint FROM "AutomationRule" WHERE "version" < 1
    UNION ALL SELECT 'Reservation', COUNT(*)::bigint FROM "Reservation" WHERE "version" < 1
    UNION ALL SELECT 'Stocktake', COUNT(*)::bigint FROM "Stocktake" WHERE "version" < 1
    UNION ALL SELECT 'RfidCredential', COUNT(*)::bigint FROM "RfidCredential" WHERE "version" < 1
    UNION ALL SELECT 'Shop', COUNT(*)::bigint FROM "Shop" WHERE "version" < 1
  `;
  const invalidAggregates = badVersions.filter((row) => Number(row.count) !== 0);
  if (invalidAggregates.length) {
    throw new Error(`Invalid optimistic versions: ${invalidAggregates.map((row) => row.aggregate).join(', ')}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
