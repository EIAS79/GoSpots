import type { PrismaClient } from '@prisma/client';
import { ApiDomainErrorCode } from './api-error.codes';
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

  it('hashes semantically identical JSON objects identically regardless of key order', () => {
    expect(
      hashIdempotencyRequest({
        amount: '10.0000',
        customer: { id: 'c1', tags: ['vip', 'member'] },
      }),
    ).toBe(
      hashIdempotencyRequest({
        customer: { tags: ['vip', 'member'], id: 'c1' },
        amount: '10.0000',
      }),
    );
  });

  it('preserves array order in the canonical request hash', () => {
    expect(hashIdempotencyRequest({ ids: ['a', 'b'] })).not.toBe(
      hashIdempotencyRequest({ ids: ['b', 'a'] }),
    );
  });

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

  it('rejects the same key with stable IDEMPOTENCY_CONFLICT when the request payload changes', async () => {
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
    ).rejects.toMatchObject({
      response: { code: ApiDomainErrorCode.IDEMPOTENCY_CONFLICT },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns stable IDEMPOTENCY_CONFLICT while an existing request is still pending', async () => {
    const prisma = fakePrisma() as PrismaClient & {
      idempotencyReceipt: { create: jest.Mock; update: jest.Mock };
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });
    const requestHash = hashIdempotencyRequest({ amount: '10.0000' });

    const originalUpdate = prisma.idempotencyReceipt.update;
    prisma.idempotencyReceipt.update = jest.fn(
      () => new Promise(() => undefined),
    );
    void withClientIdempotency(
      prisma,
      {
        shopId: 'shop-a',
        scope: 'checkout.settle',
        key: 'pending-key',
        requestHash,
      },
      execute,
    );

    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(
      withClientIdempotency(
        prisma,
        {
          shopId: 'shop-a',
          scope: 'checkout.settle',
          key: 'pending-key',
          requestHash,
        },
        execute,
      ),
    ).rejects.toMatchObject({
      response: { code: ApiDomainErrorCode.IDEMPOTENCY_CONFLICT },
    });
    prisma.idempotencyReceipt.update = originalUpdate;
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
