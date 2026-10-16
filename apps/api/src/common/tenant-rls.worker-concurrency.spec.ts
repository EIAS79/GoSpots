import type { Prisma, PrismaClient } from '@prisma/client';
import {
  getTenantRlsStore,
  withTenantRls,
  wrapPrismaWithTenantRls,
} from './tenant-rls.util';

describe('T-006 independently scoped tenant workers and pooled request contexts', () => {
  function fixture() {
    const transactions: Prisma.TransactionClient[] = [];
    const prisma = {
      $transaction: (
        fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) => {
        const tx = {
          $executeRaw: () => Promise.resolve(1),
          reservation: {
            findMany: () =>
              Promise.resolve([
                { shopId: getTenantRlsStore()?.shopId ?? 'MISSING' },
              ]),
          },
        } as unknown as Prisma.TransactionClient;
        transactions.push(tx);
        return fn(tx);
      },
    } as unknown as PrismaClient;
    return { prisma, transactions };
  }

  it('isolates concurrent top-level workers on separate Prisma transactions', async () => {
    const { prisma, transactions } = fixture();
    const delegated = wrapPrismaWithTenantRls(prisma);
    const worker = (shopId: string) =>
      withTenantRls(prisma, { shopId, mode: 'tenant' }, async (tx) => {
        await Promise.resolve();
        expect(getTenantRlsStore()?.tx).toBe(tx);
        expect(getTenantRlsStore()?.shopId).toBe(shopId);
        const reservations = await delegated.reservation.findMany({
          select: { shopId: true },
        });
        await Promise.resolve();
        expect(getTenantRlsStore()?.shopId).toBe(shopId);
        return reservations[0]?.shopId;
      });
    const values = await Promise.all([worker('shop-a'), worker('shop-b')]);
    expect(values).toEqual(['shop-a', 'shop-b']);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).not.toBe(transactions[1]);
    expect(getTenantRlsStore()).toBeUndefined();
  });

  it('rejects worker cross-tenant hopping and privileged mode escalation', async () => {
    const { prisma } = fixture();
    await withTenantRls(
      prisma,
      { shopId: 'shop-a', mode: 'tenant' },
      async () => {
        await expect(
          withTenantRls(prisma, { shopId: 'shop-b', mode: 'tenant' }, () =>
            Promise.resolve(true),
          ),
        ).rejects.toThrow(/Cannot change tenant or privilege/);
        await expect(
          withTenantRls(prisma, { shopId: 'shop-a', mode: 'system' }, () =>
            Promise.resolve(true),
          ),
        ).rejects.toThrow(/Cannot change tenant or privilege/);
        expect(getTenantRlsStore()?.shopId).toBe('shop-a');
      },
    );
    expect(getTenantRlsStore()).toBeUndefined();
  });

  it('clears failed worker ALS scope without contaminating a following worker', async () => {
    const { prisma } = fixture();
    await expect(
      withTenantRls(prisma, { shopId: 'shop-a', mode: 'tenant' }, () =>
        Promise.reject(new Error('deliberate worker rollback')),
      ),
    ).rejects.toThrow('deliberate worker rollback');
    expect(getTenantRlsStore()).toBeUndefined();
    await withTenantRls(prisma, { shopId: 'shop-b', mode: 'tenant' }, () => {
      expect(getTenantRlsStore()?.shopId).toBe('shop-b');
      return Promise.resolve();
    });
    expect(getTenantRlsStore()).toBeUndefined();
  });
});
