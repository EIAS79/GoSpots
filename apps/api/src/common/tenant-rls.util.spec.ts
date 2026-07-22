import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@prisma/client';
import {
  applyTenantRlsSession,
  isTenantRlsEnabled,
  tenantRlsAls,
  withTenantRls,
  wrapPrismaWithTenantRls,
} from './tenant-rls.util';

describe('isTenantRlsEnabled', () => {
  it('defaults off', () => {
    expect(isTenantRlsEnabled({})).toBe(false);
    expect(isTenantRlsEnabled({ TENANT_RLS: '' })).toBe(false);
    expect(isTenantRlsEnabled({ TENANT_RLS: 'false' })).toBe(false);
  });

  it('accepts true|1|on (case-insensitive)', () => {
    expect(isTenantRlsEnabled({ TENANT_RLS: 'true' })).toBe(true);
    expect(isTenantRlsEnabled({ TENANT_RLS: '1' })).toBe(true);
    expect(isTenantRlsEnabled({ TENANT_RLS: 'ON' })).toBe(true);
  });
});

describe('applyTenantRlsSession', () => {
  it('SET LOCAL shop id + mode via set_config', async () => {
    const calls: unknown[][] = [];
    const tx = {
      $executeRaw: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve(undefined);
      },
    };
    await applyTenantRlsSession(tx as never, {
      shopId: 'shop_a',
      mode: 'tenant',
    });
    expect(calls).toHaveLength(2);
    // Prisma tagged template: [strings, ...values]
    expect(String(calls[0][0])).toContain('app.current_shop_id');
    expect(calls[0][1]).toBe('shop_a');
    expect(String(calls[1][0])).toContain('app.rls_mode');
    expect(calls[1][1]).toBe('tenant');
  });
});

describe('withTenantRls', () => {
  it('opens $transaction, applies session, exposes tx to fn', async () => {
    const innerTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      marker: 'inner',
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: typeof innerTx) => Promise<string>) =>
        fn(innerTx),
      ),
    };

    const result = await withTenantRls(
      prisma as never,
      { shopId: 'shop_b', mode: 'tenant' },
      async (tx) => {
        expect(tx).toBe(innerTx);
        expect(tenantRlsAls.getStore()?.shopId).toBe('shop_b');
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(innerTx.$executeRaw).toHaveBeenCalled();
    expect(tenantRlsAls.getStore()).toBeUndefined();
  });

  it('reuses existing ALS transaction without nesting pool checkout', async () => {
    const existingTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = { $transaction: jest.fn() };

    const result = await tenantRlsAls.run(
      { tx: existingTx as never, shopId: 'shop_old', mode: 'tenant' },
      () =>
        withTenantRls(
          prisma as never,
          { shopId: 'shop_new', mode: 'public_insert' },
          async (tx) => {
            expect(tx).toBe(existingTx);
            expect(tenantRlsAls.getStore()?.shopId).toBe('shop_new');
            return 42;
          },
        ),
    );

    expect(result).toBe(42);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(existingTx.$executeRaw).toHaveBeenCalled();
  });
});

describe('wrapPrismaWithTenantRls', () => {
  it('routes model delegate to ALS tx when active', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: '1' }]);
    const alsTx = { menuItem: { findMany } };
    const base = {
      menuItem: { findMany: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaClient;

    const wrapped = wrapPrismaWithTenantRls(base);

    await tenantRlsAls.run(
      { tx: alsTx as never, shopId: 'shop_a', mode: 'tenant' },
      async () => {
        await wrapped.menuItem.findMany({ where: { shopId: 'shop_a' } });
      },
    );

    expect(findMany).toHaveBeenCalledWith({ where: { shopId: 'shop_a' } });
    expect(base.menuItem.findMany).not.toHaveBeenCalled();
  });

  it('nested $transaction(fn) reuses ALS tx', async () => {
    const alsTx = { marker: 'als' };
    const base = {
      $transaction: jest.fn(),
    } as unknown as PrismaClient;
    const wrapped = wrapPrismaWithTenantRls(base);

    await tenantRlsAls.run(
      { tx: alsTx as never, shopId: 'shop_a', mode: 'tenant' },
      async () => {
        const out = await (
          wrapped.$transaction as (fn: (tx: unknown) => Promise<string>) => Promise<string>
        )(async (tx) => {
          expect(tx).toBe(alsTx);
          return 'nested';
        });
        expect(out).toBe('nested');
      },
    );

    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('uses real client when ALS empty', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const base = {
      menuItem: { findMany },
      $transaction: jest.fn(),
    } as unknown as PrismaClient;
    const wrapped = wrapPrismaWithTenantRls(base);

    await wrapped.menuItem.findMany();
    expect(findMany).toHaveBeenCalled();
  });
});

describe('tenantRlsAls isolation', () => {
  it('does not leak across async boundaries', async () => {
    expect(tenantRlsAls).toBeInstanceOf(AsyncLocalStorage);
    expect(tenantRlsAls.getStore()).toBeUndefined();
  });
});
