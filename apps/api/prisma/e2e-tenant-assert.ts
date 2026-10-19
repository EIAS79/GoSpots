/**
 * PostgreSQL RLS negative proof for E2E seeded checkout data.
 * Must run ONLY on a disposable, migrated, seeded CI database with admin rights.
 * Never execute this against production or a shared staging database.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const database = process.env.DATABASE_URL;
const host = database ? new URL(database).hostname : '';
if (
  process.env.GOSPOTS_DISPOSABLE_E2E_DB !== 'I_UNDERSTAND_DELETE_AND_ROLES' ||
  process.env.GOSPOTS_E2E_DB !== 'true' ||
  !['localhost', '127.0.0.1'].includes(host)
) {
  throw new Error(
    'Tenant RLS assertions require disposable local CI Postgres, E2E marker and explicit authorization',
  );
}

const prisma = new PrismaClient();
const role = 'gospots_ci_rls_reader';
const shopA = 'e2e-shop-payment';
const shopB = 'e2e-shop-cash';
const tables = [
  'GuestCheck',
  'CheckSettlement',
  'ChargeSnapshot',
  'Payment',
  'PaymentAllocation',
  'PaymentOperation',
  'Refund',
  'RefundAllocation',
  'DomainEventOutbox',
  'PaymentWebhookEvent',
  'ShopFeatureFlag',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('E2E tenant isolation: ' + message);
}

async function withRls<T>(
  shopId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE ' + role);
    await tx.$executeRaw`SELECT set_config('app.rls_mode', 'tenant', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_shop_id', ${shopId}, true)`;
    return fn(tx);
  });
}

async function main() {
  const aPayment = await prisma.payment.findFirst({
    where: { shopId: shopA, status: 'SUCCESS' },
    select: { id: true },
  });
  assert(
    aPayment,
    'seed + browser flows must create a genuine gaming payment before RLS evaluation',
  );

  // CI test role is intentionally distinct from the Prisma admin/owner.
  // FORCE RLS cannot prove isolation while evaluating queries as a superuser.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gospots_ci_rls_reader') THEN
        CREATE ROLE gospots_ci_rls_reader NOLOGIN;
      END IF;
    END $$
  `);
  await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO ' + role);
  for (const table of tables) {
    await prisma.$executeRawUnsafe(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "' + table + '" TO ' + role,
    );
    const policy = await prisma.$queryRawUnsafe<
      Array<{ enabled: boolean; forced: boolean }>
    >(
      `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
       FROM pg_class WHERE oid = $1::regclass`,
      'public."' + table + '"',
    );
    assert(
      policy[0]?.enabled && policy[0]?.forced,
      table + ' must have enabled and forced RLS',
    );
  }

  for (const [viewer, other] of [
    [shopA, shopB],
    [shopB, shopA],
  ]) {
    await withRls(viewer, async (tx) => {
      for (const table of tables) {
        const leaks = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          'SELECT COUNT(*)::bigint AS count FROM "' +
            table +
            '" WHERE "shopId" = $1',
          other,
        );
        assert(
          Number(leaks[0]?.count ?? 0n) === 0,
          `${viewer} read foreign ${table} rows`,
        );
      }
      const own = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        'SELECT COUNT(*)::bigint AS count FROM "ShopFeatureFlag" WHERE "shopId" = $1',
        viewer,
      );
      assert(
        Number(own[0]?.count ?? 0n) >= 1,
        viewer + ' could not see own seeded feature flags',
      );
    });
  }

  // A tenant-scoped background worker must not be able to enqueue an event
  // under another shop even if the caller forges its outbox envelope.
  const forgedAggregate = 'w1-rls-cross-tenant-' + Date.now();
  let blockedOutboxInsert = false;
  try {
    await withRls(shopA, async (tx) => {
      await tx.domainEventOutbox.create({
        data: {
          shopId: shopB,
          aggregateType: 'tenant-rls-negative',
          aggregateId: forgedAggregate,
          eventType: 'payment.refund-forged',
          payload: { shopId: shopB, attempt: 'forged' },
        },
      });
    });
  } catch (error) {
    blockedOutboxInsert = /row.level.security|policy|42501|new row violates/i.test(String(error));
  }
  assert(blockedOutboxInsert, 'RLS must reject foreign background event INSERT');
  assert(
    await prisma.domainEventOutbox.count({
      where: { aggregateId: forgedAggregate, shopId: shopB },
    }) === 0,
    'denied background event must leave no outbox record',
  );

  const paymentBefore = await prisma.payment.findUniqueOrThrow({
    where: { id: aPayment.id },
  });
  let rejectedByPolicy = false;
  try {
    await withRls(shopA, async (tx) => {
      await tx.$executeRawUnsafe(
        'UPDATE "Payment" SET "shopId" = $1 WHERE "id" = $2',
        shopB,
        aPayment.id,
      );
      // An allowed update would still roll back due to this deliberate assertion.
      throw new Error('RLS_UPDATE_ALLOWED: modified payment tenant');
    });
  } catch (error) {
    const message = String(error);
    assert(
      !message.includes('RLS_UPDATE_ALLOWED'),
      'RLS allowed a financial tenant reassignment',
    );
    rejectedByPolicy = /row.level.security|policy|42501|new row violates/i.test(
      message,
    );
  }
  assert(
    rejectedByPolicy,
    'foreign payment UPDATE must be denied by RLS WITH CHECK',
  );

  const paymentAfter = await prisma.payment.findUniqueOrThrow({
    where: { id: aPayment.id },
  });
  assert(
    paymentAfter.shopId === paymentBefore.shopId &&
      paymentAfter.status === paymentBefore.status &&
      paymentAfter.amount.equals(paymentBefore.amount),
    'RLS tests must leave original financial state unchanged',
  );
  // Verify no prior connection/transaction-local shop identity survives in a new transaction.
  await withRls(shopB, async (tx) => {
    const foreign = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "Payment" WHERE "shopId" = $1',
      shopA,
    );
    assert(
      Number(foreign[0]?.count ?? 0n) === 0,
      'Prisma connection inherited prior shop context',
    );
  });
  console.log(
    'E2E PostgreSQL tenant RLS matrix PASS for 11 financial/event/feature tables, two shops, denied update and pooled transaction reset.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
