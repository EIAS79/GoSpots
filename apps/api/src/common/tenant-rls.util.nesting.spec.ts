import type { Prisma, PrismaClient } from '@prisma/client';
import {
  withTenantRls,
  getTenantRlsStore,
  applyTenantRlsSession,
} from './tenant-rls.util';

describe('tenant RLS context cannot leak between concurrent nested operations', () => {
  function harness() {
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $executeRaw: execute } as unknown as Prisma.TransactionClient;
    const transaction = jest.fn(
      (fn: (inner: Prisma.TransactionClient) => Promise<unknown>) => fn(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    return { execute, transaction, tx, prisma };
  }
  const tenantA = { shopId: 'shop-a', mode: 'tenant' } as const;

  it('reuses the transaction without issuing SET LOCAL for matching nested scope', async () => {
    const h = harness();
    await withTenantRls(h.prisma, tenantA, async () => {
      const before = h.execute.mock.calls.length;
      await withTenantRls(h.prisma, tenantA, (inner) => {
        expect(inner).toBe(h.tx);
        expect(getTenantRlsStore()).toMatchObject(tenantA);
        return Promise.resolve();
      });
      expect(h.execute.mock.calls).toHaveLength(before);
    });
  });

  it('rejects concurrent cross-tenant nesting before SQL context switches', async () => {
    const h = harness();
    await withTenantRls(h.prisma, tenantA, async () => {
      const before = h.execute.mock.calls.length;
      const results = await Promise.allSettled([
        withTenantRls(h.prisma, tenantA, () =>
          Promise.resolve(getTenantRlsStore()?.shopId),
        ),
        withTenantRls(h.prisma, { shopId: 'shop-b', mode: 'tenant' }, () =>
          Promise.resolve('wrong'),
        ),
      ]);
      expect(results[0]).toMatchObject({
        status: 'fulfilled',
        value: 'shop-a',
      });
      expect(results[1]).toMatchObject({ status: 'rejected' });
      expect(h.execute.mock.calls).toHaveLength(before);
      expect(getTenantRlsStore()).toMatchObject(tenantA);
    });
  });

  it.each(['system', 'bypass', 'public_insert'] as const)(
    'blocks nested transition to %s',
    async (mode) => {
      const h = harness();
      await withTenantRls(h.prisma, tenantA, async () => {
        const before = h.execute.mock.calls.length;
        await expect(
          withTenantRls(h.prisma, { shopId: 'shop-a', mode }, () =>
            Promise.resolve('bad'),
          ),
        ).rejects.toThrow(/Cannot change tenant or privilege/);
        expect(h.execute.mock.calls).toHaveLength(before);
      });
    },
  );

  it('direct helper refuses mode switch before running SQL', async () => {
    const h = harness();
    await withTenantRls(h.prisma, tenantA, async () => {
      const before = h.execute.mock.calls.length;
      await expect(
        applyTenantRlsSession(h.tx as never, {
          shopId: 'shop-b',
          mode: 'system',
        }),
      ).rejects.toThrow(/Cannot change tenant or privilege/);
      expect(h.execute.mock.calls).toHaveLength(before);
    });
  });

  it('rejects missing shop context before opening the transaction', async () => {
    const h = harness();
    await expect(
      withTenantRls(h.prisma, { shopId: '', mode: 'tenant' }, () =>
        Promise.resolve(1),
      ),
    ).rejects.toThrow(/nonempty trusted shopId/);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('nested exception cannot alter context and rollback clears ALS', async () => {
    const h = harness();
    await expect(
      withTenantRls(h.prisma, tenantA, async () => {
        await expect(
          withTenantRls(h.prisma, { shopId: 'shop-b', mode: 'tenant' }, () =>
            Promise.resolve(1),
          ),
        ).rejects.toThrow(/Cannot change tenant or privilege/);
        expect(getTenantRlsStore()).toMatchObject(tenantA);
        throw new Error('rollback expected');
      }),
    ).rejects.toThrow('rollback expected');
    expect(getTenantRlsStore()).toBeUndefined();
    expect(h.execute.mock.calls).toHaveLength(2);
  });
});
