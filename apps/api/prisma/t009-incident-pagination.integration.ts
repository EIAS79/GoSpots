/**
 * Test-only real-PostgreSQL integration for the existing HardwareService query.
 * Requires GOSPOTS_T009_DISPOSABLE_DB=YES and an exact localhost PostgreSQL 17
 * URL naming gospots_t009_*. Never uses Neon or a shared environment.
 * Schema contains only the PrintJob fixture model, not application migrations.
 */
import assert from 'node:assert/strict';
import { PrismaClient, PrintJobStatus, PrintJobType } from '@prisma/client';
import { HardwareService } from '../src/modules/hardware/hardware.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';

const url = new URL(process.env.DATABASE_URL || 'http://invalid/');
if (
  process.env.GOSPOTS_T009_DISPOSABLE_DB !== 'YES' ||
  url.protocol !== 'postgresql:' ||
  url.hostname !== '127.0.0.1' ||
  url.port !== '55447' ||
  !/^\/gospots_t009_[a-z0-9_]+$/.test(url.pathname)
) {
  throw new Error(
    'REFUSED: requires explicit disposable localhost PG17 gospots_t009_* fixture',
  );
}

const prisma = new PrismaClient();
const shopA = 't009-integration-shop-A';
const shopB = 't009-integration-shop-B';
const actor = (shopId: string) => ({ shopId }) as JwtAccessPayload;
const service = new HardwareService(
  prisma as never,
  { isFeatureEnabled: () => Promise.resolve(true) } as never,
  {} as never,
  {} as never,
);
let count = 0;
function check(condition: unknown, title: string) {
  assert.ok(condition, title);
  count += 1;
}
function cursor(shopId: string, id: string, createdAt: string) {
  return Buffer.from(JSON.stringify({ v: 1, shopId, id, createdAt })).toString(
    'base64url',
  );
}
const equalDay = new Date('2026-10-15T04:00:00.000Z');
const laterDay = new Date('2026-10-16T04:00:00.000Z');
const oldDay = new Date('2026-10-14T04:00:00.000Z');
const make = (shopId: string, index: number) => ({
  id: `t009-${shopId === shopA ? 'a' : 'b'}-${String(index).padStart(4, '0')}`,
  shopId,
  type: PrintJobType.CUSTOMER_RECEIPT,
  printerDeviceId: 't009-printer-1',
  sourceType: 'GuestCheck',
  sourceId: `t009-check-${index}`,
  payload: { customer: 'private@example.test' },
  dedupeKey: `t009-${shopId}-${index}`,
  fiscalSemanticKey: `fiscal-private-${shopId}-${index}`,
  status: PrintJobStatus.PRINTING,
  lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN',
  lastError: 'Bearer secret-key https://printer.test/?token=private',
  claimedByEdgeDeviceId: 't009-edge-1',
  claimedAt: equalDay,
  createdAt: index < 120 ? equalDay : laterDay,
  updatedAt: laterDay,
});

async function setupTable() {
  await prisma.$executeRawUnsafe(
    "CREATE TYPE \"PrintJobType\" AS ENUM ('KITCHEN','BAR','CUSTOMER_RECEIPT','INVOICE','SHIFT','LABEL')",
  );
  await prisma.$executeRawUnsafe(
    "CREATE TYPE \"PrintJobStatus\" AS ENUM ('QUEUED','CLAIMED','PRINTING','SUCCEEDED','FAILED','CANCELED')",
  );
  await prisma.$executeRawUnsafe(`CREATE TABLE "PrintJob" (
    "id" TEXT PRIMARY KEY, "shopId" TEXT NOT NULL, "type" "PrintJobType" NOT NULL,
    "routeId" TEXT, "printerDeviceId" TEXT NOT NULL, "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL, "payload" JSONB NOT NULL, "dedupeKey" TEXT NOT NULL,
    "fiscalSemanticKey" TEXT, "status" "PrintJobStatus" NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "claimedByEdgeDeviceId" TEXT, "claimedAt" TIMESTAMP(3),
    "printingAt" TIMESTAMP(3), "printedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT, "lastError" TEXT, "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "t009_scope" ON "PrintJob" ("shopId", "status", "createdAt", "id")',
  );
}

async function execute() {
  await prisma.$connect();
  const [{ major, full }] = await prisma.$queryRawUnsafe<
    Array<{ major: number; full: string }>
  >(
    "SELECT current_setting('server_version_num')::integer / 10000 AS major, version() AS full",
  );
  check(major === 17, 'PostgreSQL server must be version 17');
  console.log('T009_PG_SERVER', full.split(' on ')[0]);
  await setupTable();
  const a = Array.from({ length: 137 }, (_, i) => make(shopA, i));
  const b = Array.from({ length: 137 }, (_, i) => make(shopB, i));
  await prisma.printJob.createMany({ data: [...a, ...b] });
  await prisma.printJob.createMany({
    data: [
      {
        ...make(shopA, 200),
        id: 't009-excluded-success',
        status: PrintJobStatus.SUCCEEDED,
      },
      {
        ...make(shopA, 201),
        id: 't009-excluded-preflight',
        status: PrintJobStatus.FAILED,
        lastErrorCode: 'UNSUPPORTED_PRINTER_ADAPTER',
      },
      {
        ...make(shopA, 202),
        id: 't009-late-success',
        status: PrintJobStatus.CLAIMED,
      },
      {
        ...make(shopA, 203),
        id: 't009-older-success',
        status: PrintJobStatus.SUCCEEDED,
        createdAt: oldDay,
      },
    ],
  });
  let next: string | undefined;
  const observed: string[] = [];
  for (let page = 0; page < 8; page++) {
    const result = await service.listPrintIncidents(actor(shopA), '23', next);
    check(result.items.length <= 23, 'bounded page size');
    check(
      result.items.every((x) => x.shopId === shopA),
      'tenant isolation on page',
    );
    check(
      result.items.every(
        (x) =>
          !('payload' in x) &&
          !('dedupeKey' in x) &&
          !('fiscalSemanticKey' in x),
      ),
      'metadata only',
    );
    check(
      result.items.every(
        (x) =>
          !JSON.stringify(x).includes('secret-key') &&
          !JSON.stringify(x).includes('private@example.test'),
      ),
      'sanitized error and no customer payload',
    );
    observed.push(...result.items.map((x) => x.id));
    if (!result.hasMore) {
      check(result.nextCursor === null, 'last page end');
      break;
    }
    check(!!result.nextCursor, 'cursor exists for next page');
    next = result.nextCursor ?? undefined;
  }
  check(
    observed.length === 138,
    'all 137 uncertain jobs plus one pending late-success job',
  );
  check(
    new Set(observed).size === observed.length,
    'stable dataset no duplicate identifiers',
  );
  const sorted = [...observed].sort((x, y) => {
    const rx =
      x === 't009-late-success'
        ? laterDay
        : x.endsWith('0120') || Number(x.slice(-4)) >= 120
          ? laterDay
          : equalDay;
    const ry =
      y === 't009-late-success'
        ? laterDay
        : y.endsWith('0120') || Number(y.slice(-4)) >= 120
          ? laterDay
          : equalDay;
    return rx.getTime() - ry.getTime() || x.localeCompare(y);
  });
  check(
    JSON.stringify(observed) === JSON.stringify(sorted),
    'createdAt/id deterministic keyset ordering',
  );
  check(
    !observed.includes('t009-excluded-success') &&
      !observed.includes('t009-excluded-preflight'),
    'exclude successful and ordinary preflight failed',
  );
  for (const invalid of [
    '!',
    Buffer.from('{').toString('base64url'),
    'x'.repeat(1025),
    cursor(shopB, 't009-b-0001', equalDay.toISOString()),
  ]) {
    await assert.rejects(() =>
      service.listPrintIncidents(actor(shopA), '25', invalid),
    );
    count++;
  }
  for (const bad of ['0', '101', '1.5']) {
    await assert.rejects(() => service.listPrintIncidents(actor(shopA), bad));
    count++;
  }
  await assert.rejects(() => service.listPrintIncidents(actor(''), '25'));
  count++;
  // Dynamic list, not a snapshot: create a newly uncertain record behind the cursor.
  const first = await service.listPrintIncidents(actor(shopA), '50');
  check(!!first.nextCursor, 'first-page cursor exists');
  await prisma.printJob.update({
    where: { id: 't009-older-success' },
    data: {
      status: PrintJobStatus.PRINTING,
      lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN',
      lastError: 'unknown after physical dispatch',
    },
  });
  await prisma.printJob.update({
    where: { id: 't009-b-0001' },
    data: { status: PrintJobStatus.SUCCEEDED },
  });
  const after = await service.listPrintIncidents(
    actor(shopA),
    '100',
    first.nextCursor!,
  );
  check(
    after.items.every((x) => x.shopId === shopA),
    'concurrent cross-tenant update remains isolated',
  );
  check(
    !after.items.some((x) => x.id === 't009-older-success'),
    'older incident newly qualifying behind cursor omitted from continuation',
  );
  // Overlapping real PostgreSQL reads and unrelated-tenant status updates.
  const raced = await Promise.all([
    service.listPrintIncidents(actor(shopA), '60'),
    prisma.printJob.update({
      where: { id: 't009-b-0002' },
      data: { status: PrintJobStatus.SUCCEEDED },
    }),
    service.listPrintIncidents(actor(shopA), '60', first.nextCursor!),
    prisma.printJob.update({
      where: { id: 't009-b-0003' },
      data: {
        status: PrintJobStatus.FAILED,
        lastErrorCode: 'EDGE_PRINT_LEASE_EXPIRED',
      },
    }),
  ]);
  check(
    raced[0].items.every((x) => x.shopId === shopA) &&
      raced[2].items.every((x) => x.shopId === shopA),
    'overlapping status writes and reads retain tenant isolation',
  );
  const refreshed = await service.listPrintIncidents(actor(shopA), '25');
  check(
    refreshed.items.some((x) => x.id === 't009-older-success'),
    'refresh discovers newly qualifying older job',
  );
  await prisma.printJob.update({
    where: { id: 't009-late-success' },
    data: {
      status: PrintJobStatus.SUCCEEDED,
      lastError: null,
      lastErrorCode: null,
      printedAt: new Date(),
    },
  });
  const afterLate = await service.listPrintIncidents(actor(shopA), '100');
  check(
    !afterLate.items.some((x) => x.id === 't009-late-success'),
    'late original success exits active incident list',
  );
  console.log('T009_PG17_ASSERTIONS', count, 'PASS');
  console.log(
    'T009_PAGINATION',
    JSON.stringify({
      shopA: 137,
      shopB: 137,
      visited: observed.length,
      unique: new Set(observed).size,
      lateSuccessRemoved: true,
      concurrentOlderIncidentRequiresRefresh: true,
      snapshotConsistent: false,
    }),
  );
}
async function main() {
  try {
    await execute();
  } finally {
    // Only the expressly disposable database is accessible, even on failure.
    await prisma.$disconnect();
    console.log('T009_FIXTURE_DISCONNECT_COMPLETE');
  }
}
void main().catch((e) => {
  console.error('T009_PG17_FAILED', e);
  process.exitCode = 1;
});
