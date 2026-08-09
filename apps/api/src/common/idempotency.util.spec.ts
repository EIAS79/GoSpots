import type { PrismaClient } from '@prisma/client';
import {
  clearIdempotencyMemoryCache,
  hashIdempotencyRequest,
  withClientIdempotency,
} from './idempotency.util';

type Receipt = {
  status: string;
  requestHash: string | null;
  responseJson: string | null;
  expiresAt: Date | null;
};

describe('withClientIdempotency', () => {
  beforeEach(() => clearIdempotencyMemoryCache());

  function fakePrisma() {
    const store = new Map<string, Receipt>();
    const composite = (where: any) => {
      const value = where.shopId_scope_key;
      return `${value.shopId}:${value.scope}:${value.key}`;
    };
    const prisma = {
      idempotencyReceipt: {
        findUnique: jest.fn(async ({ where }: any) => store.get(composite(where)) ?? null),
        create: jest.fn(async ({ data }: any) => {
          const key = `${data.shopId}:${data.scope}:${data.key}`;
          store.set(key, {
            status: data.status,
            requestHash: data.requestHash ?? null,
            responseJson: data.responseJson ?? null,
            expiresAt: data.expiresAt ?? null,
          });
          return data;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const key = composite(where);
          const current = store.get(key)!;
          store.set(key, { ...current, ...data });
          return store.get(key);
        }),
        delete: jest.fn(async ({ where }: any) => {
          store.delete(composite(where));
          return {};
        }),
      },
    } as unknown as PrismaClient;
    return prisma;
  }

  it('replays the same response for the same Shop, operation and request', async () => {
    const prisma = fakePrisma();
    const execute = jest.fn().mockResolvedValue({ ok: true, settlementId: 's1' });
    const requestHash = hashIdempotencyRequest({ amount: '10.0000' });
    const options = {
      shopId: 'shop-a',
      scope: 'checkout.settle',
      key: 'idem_12345678',
      requestHash,
    };

    await expect(withClientIdempotency(prisma, options, execute)).resolves.toEqual({
      ok: true,
      settlementId: 's1',
    });
    await expect(withClientIdempotency(prisma, options, execute)).resolves.toEqual({
      ok: true,
      settlementId: 's1',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects the same key when the request payload changes', async () => {
    const prisma = fakePrisma();
    const execute = jest.fn().mockResolvedValue({ ok: true });

    await withClientIdempotency(
      prisma,
      {
        shopId: 'shop-a',
        scope: 'checkout.settle',
        key: 'idem_12345678',
        requestHash: hashIdempotencyRequest({ amount: '10.0000' }),
      },
      execute,
    );

    await expect(
      withClientIdempotency(
        prisma,
        {
          shopId: 'shop-a',
          scope: 'checkout.settle',
          key: 'idem_12345678',
          requestHash: hashIdempotencyRequest({ amount: '11.0000' }),
        },
        execute,
      ),
    ).rejects.toThrow('different request payload');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('keeps identical keys isolated across Shops', async () => {
    const prisma = fakePrisma();
    const execute = jest.fn().mockResolvedValue({ ok: true });

    for (const shopId of ['shop-a', 'shop-b']) {
      await withClientIdempotency(
        prisma,
        {
          shopId,
          scope: 'checkout.settle',
          key: 'same-key',
          requestHash: 'same-hash',
        },
        execute,
      );
    }

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
