import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import { GrowthAnalyticsService } from '../src/modules/growth/growth-analytics.service';
import { Phase14AnalyticsService } from '../src/modules/growth/phase14-analytics.service';

const prisma = new PrismaClient();

const LEDGER_ROWS = Number(process.env.PHASE14_DB_LEDGER_ROWS ?? 200_000);
const CHECK_ROWS = Number(process.env.PHASE14_DB_CHECK_ROWS ?? 25_000);
const OTHER_TENANT_LEDGER_ROWS = Number(process.env.PHASE14_DB_OTHER_TENANT_LEDGER_ROWS ?? 10_000);
const BATCH_SIZE = Number(process.env.PHASE14_DB_BATCH_SIZE ?? 2_500);
const SEED_BUDGET_MS = Number(process.env.PHASE14_DB_SEED_BUDGET_MS ?? 120_000);
const WORKSPACE_BUDGET_MS = Number(process.env.PHASE14_DB_WORKSPACE_BUDGET_MS ?? 15_000);

const currency = 'PLN';
const dateKey = '2026-08-18';
const occurredAt = new Date('2026-08-18T12:00:00.000Z');
const openedAt = new Date('2026-08-18T11:30:00.000Z');
const ledgerAmount = '1.2500';
const settlementAmount = '10.0000';

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertFiniteBudget(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

async function insertGuestChecks(shopId: string, prefix: string) {
  for (let start = 0; start < CHECK_ROWS; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, CHECK_ROWS - start);
    await prisma.guestCheck.createMany({
      data: Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        return {
          id: `${prefix}-check-${index}`,
          shopId,
          status: 'SETTLED' as const,
          currency,
          partySize: 2,
          openedAt,
          settledAt: occurredAt,
        };
      }),
    });
  }
}

async function insertSettlements(shopId: string, prefix: string) {
  for (let start = 0; start < CHECK_ROWS; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, CHECK_ROWS - start);
    await prisma.checkSettlement.createMany({
      data: Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        return {
          id: `${prefix}-settlement-${index}`,
          shopId,
          guestCheckId: `${prefix}-check-${index}`,
          state: 'PAID' as const,
          checkVersion: 1,
          sourceHash: `${prefix}-source-hash-${index}`,
          subtotal: settlementAmount,
          adjustments: '0.0000',
          taxAmount: '0.0000',
          depositAmount: '0.0000',
          total: settlementAmount,
          amountDue: '0.0000',
          currency,
          createdAt: occurredAt,
        };
      }),
    });
  }

  await prisma.$executeRawUnsafe(
    'UPDATE "GuestCheck" SET "currentSettlementId" = REPLACE("id", $2, $3) WHERE "shopId" = $1',
    shopId,
    `${prefix}-check-`,
    `${prefix}-settlement-`,
  );
}

async function insertPayments(shopId: string, prefix: string) {
  for (let start = 0; start < CHECK_ROWS; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, CHECK_ROWS - start);
    await prisma.payment.createMany({
      data: Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        return {
          id: `${prefix}-payment-${index}`,
          shopId,
          settlementId: `${prefix}-settlement-${index}`,
          method: 'CASH' as const,
          status: 'SUCCESS' as const,
          amount: settlementAmount,
          currency,
          correlationId: `${prefix}-payment-correlation-${index}`,
          succeededAt: occurredAt,
          createdAt: occurredAt,
        };
      }),
    });
  }
}

async function insertLedger(shopId: string, prefix: string, count: number, amount: string) {
  for (let start = 0; start < count; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, count - start);
    await prisma.ledgerEntry.createMany({
      data: Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        return {
          id: `${prefix}-ledger-${index}`,
          shopId,
          currency,
          amount,
          kind: 'SALE' as const,
          channel: 'QUICK_SALES' as const,
          sourceType: 'TRANSACTION' as const,
          sourceId: `${prefix}-ledger-source-${index}`,
          occurredAt,
        };
      }),
    });
  }
}

type IndexRow = {
  tablename: string;
  indexdef: string;
};

async function assertTenantIndexes() {
  const rows = await prisma.$queryRaw<IndexRow[]>`
    SELECT tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('LedgerEntry', 'Payment', 'CheckSettlement')
  `;

  const hasTenantFirstIndex = (table: string) =>
    rows.some(
      (row) =>
        row.tablename === table &&
        row.indexdef.includes('("shopId"'),
    );

  const coverage = {
    ledgerEntry: hasTenantFirstIndex('LedgerEntry'),
    payment: hasTenantFirstIndex('Payment'),
    checkSettlement: hasTenantFirstIndex('CheckSettlement'),
  };

  if (!Object.values(coverage).every(Boolean)) {
    throw new Error(`Phase 14 production-like benchmark is missing tenant-first database indexes: ${JSON.stringify(coverage)}`);
  }

  return coverage;
}

async function main() {
  assertPositiveInteger('PHASE14_DB_LEDGER_ROWS', LEDGER_ROWS);
  assertPositiveInteger('PHASE14_DB_CHECK_ROWS', CHECK_ROWS);
  assertPositiveInteger('PHASE14_DB_OTHER_TENANT_LEDGER_ROWS', OTHER_TENANT_LEDGER_ROWS);
  assertPositiveInteger('PHASE14_DB_BATCH_SIZE', BATCH_SIZE);
  assertFiniteBudget('PHASE14_DB_SEED_BUDGET_MS', SEED_BUDGET_MS);
  assertFiniteBudget('PHASE14_DB_WORKSPACE_BUDGET_MS', WORKSPACE_BUDGET_MS);

  const expectedMinorFromLedger = Math.round(LEDGER_ROWS * Number(ledgerAmount) * 100);
  const expectedMinorFromSettlements = Math.round(CHECK_ROWS * Number(settlementAmount) * 100);
  if (expectedMinorFromLedger !== expectedMinorFromSettlements) {
    throw new Error(
      `Phase 14 database benchmark fixture is internally inconsistent: ledger=${expectedMinorFromLedger}, settlements=${expectedMinorFromSettlements}`,
    );
  }

  const stamp = Date.now().toString(36);
  const prefix = `phase14-db-${stamp}`;
  const otherPrefix = `phase14-db-other-${stamp}`;

  const owner = await prisma.user.create({
    data: {
      email: `${prefix}@example.invalid`,
      passwordHash: 'phase14-db-benchmark-not-a-login-secret',
      name: 'Phase 14 database benchmark',
    },
  });
  const shop = await prisma.shop.create({
    data: {
      slug: prefix,
      dashboardKey: `${prefix}-dashboard`,
      name: 'Phase 14 production-like benchmark',
      branchCode: 'P14-PERF',
      ownerId: owner.id,
      currency,
      timezone: 'Europe/Warsaw',
      businessDayStartMinutes: 240,
    },
  });
  const otherOwner = await prisma.user.create({
    data: {
      email: `${otherPrefix}@example.invalid`,
      passwordHash: 'phase14-db-benchmark-not-a-login-secret',
      name: 'Phase 14 database benchmark other tenant',
    },
  });
  const otherShop = await prisma.shop.create({
    data: {
      slug: otherPrefix,
      dashboardKey: `${otherPrefix}-dashboard`,
      name: 'Phase 14 production-like benchmark other tenant',
      ownerId: otherOwner.id,
      currency,
      timezone: 'Europe/Warsaw',
      businessDayStartMinutes: 240,
    },
  });

  const seedStarted = performance.now();
  await insertGuestChecks(shop.id, prefix);
  await insertSettlements(shop.id, prefix);
  await insertPayments(shop.id, prefix);
  await insertLedger(shop.id, prefix, LEDGER_ROWS, ledgerAmount);
  await insertLedger(otherShop.id, otherPrefix, OTHER_TENANT_LEDGER_ROWS, '99.0000');
  const seedMs = performance.now() - seedStarted;

  if (seedMs > SEED_BUDGET_MS) {
    throw new Error(`Phase 14 production-like database seed exceeded ${SEED_BUDGET_MS}ms budget: ${seedMs.toFixed(1)}ms`);
  }

  await prisma.$executeRawUnsafe('ANALYZE "GuestCheck"');
  await prisma.$executeRawUnsafe('ANALYZE "CheckSettlement"');
  await prisma.$executeRawUnsafe('ANALYZE "Payment"');
  await prisma.$executeRawUnsafe('ANALYZE "LedgerEntry"');

  const indexCoverage = await assertTenantIndexes();
  const db = prisma as unknown as PrismaService;
  const actor = { sub: owner.id, shopId: shop.id } as JwtAccessPayload;
  process.env.LEDGER_READS = 'true';

  const baseAnalytics = new GrowthAnalyticsService(db);
  const analytics = new Phase14AnalyticsService(db, baseAnalytics);
  const workspaceStarted = performance.now();
  const workspace = await analytics.workspace(actor, dateKey, dateKey);
  const workspaceMs = performance.now() - workspaceStarted;

  if (workspaceMs > WORKSPACE_BUDGET_MS) {
    throw new Error(
      `Phase 14 production-like workspace exceeded ${WORKSPACE_BUDGET_MS}ms budget: ${workspaceMs.toFixed(1)}ms`,
    );
  }

  const row = workspace.financial.currencies.find((item) => item.currency === currency);
  if (!row) throw new Error('Phase 14 production-like workspace did not return the venue currency');

  const cashTender = row.paymentMethod.CASH;
  const correctness = {
    grossSalesMinor: row.grossSalesMinor,
    netSalesMinor: row.netSalesMinor,
    cashTenderMinor: cashTender?.amountMinor ?? null,
    cashTenderCount: cashTender?.count ?? null,
    expectedMinor: expectedMinorFromLedger,
    expectedCheckCount: CHECK_ROWS,
    tenantShopId: workspace.context.shopId,
  };

  if (
    row.grossSalesMinor !== expectedMinorFromLedger ||
    row.netSalesMinor !== expectedMinorFromLedger ||
    cashTender?.amountMinor !== expectedMinorFromLedger ||
    cashTender.count !== CHECK_ROWS ||
    workspace.context.shopId !== shop.id
  ) {
    throw new Error(`Phase 14 production-like database benchmark returned incorrect analytics: ${JSON.stringify(correctness)}`);
  }

  const [ledgerCount, checkCount, settlementCount, paymentCount, otherTenantLedgerCount] = await Promise.all([
    prisma.ledgerEntry.count({ where: { shopId: shop.id } }),
    prisma.guestCheck.count({ where: { shopId: shop.id } }),
    prisma.checkSettlement.count({ where: { shopId: shop.id } }),
    prisma.payment.count({ where: { shopId: shop.id } }),
    prisma.ledgerEntry.count({ where: { shopId: otherShop.id } }),
  ]);

  const cardinality = {
    ledgerEntries: ledgerCount,
    guestChecks: checkCount,
    settlements: settlementCount,
    payments: paymentCount,
    otherTenantLedgerEntries: otherTenantLedgerCount,
    totalRows: ledgerCount + checkCount + settlementCount + paymentCount + otherTenantLedgerCount,
  };
  const expectedCardinality = {
    ledgerEntries: LEDGER_ROWS,
    guestChecks: CHECK_ROWS,
    settlements: CHECK_ROWS,
    payments: CHECK_ROWS,
    otherTenantLedgerEntries: OTHER_TENANT_LEDGER_ROWS,
    totalRows: LEDGER_ROWS + CHECK_ROWS * 3 + OTHER_TENANT_LEDGER_ROWS,
  };

  if (
    ledgerCount !== LEDGER_ROWS ||
    checkCount !== CHECK_ROWS ||
    settlementCount !== CHECK_ROWS ||
    paymentCount !== CHECK_ROWS ||
    otherTenantLedgerCount !== OTHER_TENANT_LEDGER_ROWS
  ) {
    throw new Error(
      `Phase 14 production-like database cardinality assertion failed: ${JSON.stringify({ expected: expectedCardinality, actual: cardinality })}`,
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      benchmark: 'phase14-production-like-postgres-workspace',
      seedMs: Number(seedMs.toFixed(1)),
      workspaceMs: Number(workspaceMs.toFixed(1)),
      workspaceBudgetMs: WORKSPACE_BUDGET_MS,
      seedBudgetMs: SEED_BUDGET_MS,
      cardinality,
      indexCoverage,
      correctness,
    }),
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
