import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { adjustMenuItemStockBy } from '../../src/common/menu-stock-db.util';
import {
  concurrencyTestsEnabled,
  describeConcurrency,
} from './concurrency.harness';
import {
  conflictStatus,
  createConcurrencyFixture,
  type ConcurrencyFixture,
} from './concurrency.fixtures';

/**
 * Live recipe C3 — conditional stock UPDATE path (same as finance SALE).
 * App path #5 DONE; this proves parallel writers cannot oversell.
 * Harness refuses Neon — local Docker / ephemeral only.
 */
describeConcurrency('stock last-unit oversell (live Postgres)', () => {
  let prisma: PrismaClient;
  let fixture: ConcurrencyFixture;
  const N = 15;

  beforeAll(async () => {
    if (!concurrencyTestsEnabled()) return;
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (!concurrencyTestsEnabled()) return;
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    if (!concurrencyTestsEnabled()) return;
    fixture = await createConcurrencyFixture(prisma);
  });

  afterEach(async () => {
    if (!concurrencyTestsEnabled()) return;
    await fixture?.cleanup();
  });

  async function raceSaleQtyOne() {
    return prisma.$transaction(async (db) => {
      const ok = await adjustMenuItemStockBy(
        db,
        fixture.menuItemId,
        1,
        fixture.shopId,
      );
      if (!ok) {
        throw new ConflictException('Out of stock.');
      }
      return true;
    });
  }

  it('C3: parallel SALE qty 1 on stock=1 — exactly 1 success; final stock 0; no stock < 0', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: N }, () => raceSaleQtyOne()),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);

    for (const r of rejected) {
      if (r.status !== 'rejected') continue;
      expect(conflictStatus(r.reason)).toBe(409);
    }

    const row = await prisma.menuItem.findUniqueOrThrow({
      where: { id: fixture.menuItemId },
    });
    expect(row.stock).toBe(0);
    expect(row.stock).toBeGreaterThanOrEqual(0);
  });
});
