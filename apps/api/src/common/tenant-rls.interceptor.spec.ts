import { of, throwError } from 'rxjs';
import { TenantRlsInterceptor } from './tenant-rls.interceptor';
import * as tenantRls from './tenant-rls.util';

describe('TenantRlsInterceptor', () => {
  const prisma = {
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    prisma.$transaction.mockReset();
  });

  it('passes through when TENANT_RLS is off', async () => {
    jest.spyOn(tenantRls, 'isTenantRlsEnabled').mockReturnValue(false);
    const interceptor = new TenantRlsInterceptor(prisma as never);
    const next = { handle: () => of('ok') };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { shopId: 'shop_a' } }),
      }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx as never, next).subscribe({
        next: (v) => {
          expect(v).toBe('ok');
          expect(prisma.$transaction).not.toHaveBeenCalled();
          resolve();
        },
        error: reject,
      });
    });
  });

  it('passes through without shopId', async () => {
    jest.spyOn(tenantRls, 'isTenantRlsEnabled').mockReturnValue(true);
    const interceptor = new TenantRlsInterceptor(prisma as never);
    const next = { handle: () => of('ok') };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: {} }),
      }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx as never, next).subscribe({
        next: () => {
          expect(prisma.$transaction).not.toHaveBeenCalled();
          resolve();
        },
        error: reject,
      });
    });
  });

  it('skips SSE notification stream', async () => {
    jest.spyOn(tenantRls, 'isTenantRlsEnabled').mockReturnValue(true);
    const interceptor = new TenantRlsInterceptor(prisma as never);
    const next = { handle: () => of('stream') };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { shopId: 'shop_a' },
          url: '/api/v1/notifications/stream',
          route: { path: 'stream' },
        }),
      }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx as never, next).subscribe({
        next: () => {
          expect(prisma.$transaction).not.toHaveBeenCalled();
          resolve();
        },
        error: reject,
      });
    });
  });

  it('wraps venue-bound handler in $transaction + SET LOCAL', async () => {
    jest.spyOn(tenantRls, 'isTenantRlsEnabled').mockReturnValue(true);
    const apply = jest
      .spyOn(tenantRls, 'applyTenantRlsSession')
      .mockResolvedValue(undefined);

    const tx = { id: 'tx' };
    prisma.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );

    const interceptor = new TenantRlsInterceptor(prisma as never);
    const next = { handle: () => of({ data: 1 }) };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { shopId: 'shop_a' },
          url: '/api/v1/menu',
        }),
      }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx as never, next).subscribe({
        next: (v) => {
          expect(v).toEqual({ data: 1 });
          expect(prisma.$transaction).toHaveBeenCalledTimes(1);
          expect(apply).toHaveBeenCalledWith(tx, {
            shopId: 'shop_a',
            mode: 'tenant',
          });
          resolve();
        },
        error: reject,
      });
    });
  });

  it('propagates handler errors', async () => {
    jest.spyOn(tenantRls, 'isTenantRlsEnabled').mockReturnValue(true);
    jest.spyOn(tenantRls, 'applyTenantRlsSession').mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(
      async (fn: (t: object) => Promise<unknown>) => fn({}),
    );

    const interceptor = new TenantRlsInterceptor(prisma as never);
    const next = { handle: () => throwError(() => new Error('boom')) };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { shopId: 'shop_a' },
          url: '/api/v1/menu',
        }),
      }),
    };

    await expect(
      new Promise((resolve, reject) => {
        interceptor.intercept(ctx as never, next).subscribe({
          next: resolve,
          error: reject,
        });
      }),
    ).rejects.toThrow('boom');
  });
});
