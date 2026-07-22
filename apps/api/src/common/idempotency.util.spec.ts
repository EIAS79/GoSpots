import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  clearIdempotencyMemoryCache,
  hashIdempotencyRequest,
  IDEMPOTENCY_SCOPES,
  IDEMPOTENCY_TIER_A_SCOPES,
  isIdempotencyMoneyKeysRequired,
  isIdempotencyTierAScope,
  withClientIdempotency,
} from './idempotency.util';

describe('idempotency.util', () => {
  beforeEach(() => {
    clearIdempotencyMemoryCache();
  });

  function mockPrisma(overrides: {
    findUnique?: jest.Mock;
    create?: jest.Mock;
    update?: jest.Mock;
    delete?: jest.Mock;
  }) {
    return {
      idempotencyReceipt: {
        findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
        create: overrides.create ?? jest.fn().mockResolvedValue({}),
        update: overrides.update ?? jest.fn().mockResolvedValue({}),
        delete: overrides.delete ?? jest.fn().mockResolvedValue({}),
      },
    } as never;
  }

  it('passthrough when Idempotency-Key is missing', async () => {
    const fn = jest.fn().mockResolvedValue({ id: 't1' });
    const prisma = mockPrisma({});
    const out = await withClientIdempotency(
      prisma,
      { shopId: 's1', scope: 'finance.transactions.create', key: undefined },
      fn,
    );
    expect(out).toEqual({ id: 't1' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyReceipt.create).not.toHaveBeenCalled();
  });

  it('passthrough when requireKey is off and key missing (Phase 3 default)', async () => {
    const fn = jest.fn().mockResolvedValue({ ok: true });
    const prisma = mockPrisma({});
    await withClientIdempotency(
      prisma,
      {
        shopId: 's1',
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_CREATE,
        key: null,
        requireKey: false,
      },
      fn,
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyReceipt.create).not.toHaveBeenCalled();
  });

  it('400 when requireKey is on and Idempotency-Key is missing', async () => {
    const fn = jest.fn();
    await expect(
      withClientIdempotency(
        mockPrisma({}),
        {
          shopId: 's1',
          scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_CREATE,
          key: undefined,
          requireKey: true,
        },
        fn,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fn).not.toHaveBeenCalled();
  });

  it('400 when requireKey is on and key is blank', async () => {
    const fn = jest.fn();
    await expect(
      withClientIdempotency(
        mockPrisma({}),
        {
          shopId: 's1',
          scope: IDEMPOTENCY_SCOPES.FINANCE_TRANSACTION_CREATE,
          key: '   ',
          requireKey: true,
        },
        fn,
      ),
    ).rejects.toMatchObject({
      message: 'Idempotency-Key header is required for this money operation',
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('isIdempotencyMoneyKeysRequired defaults off; true|1 enable', () => {
    expect(isIdempotencyMoneyKeysRequired({})).toBe(false);
    expect(
      isIdempotencyMoneyKeysRequired({ IDEMPOTENCY_REQUIRE_MONEY_KEYS: '' }),
    ).toBe(false);
    expect(
      isIdempotencyMoneyKeysRequired({
        IDEMPOTENCY_REQUIRE_MONEY_KEYS: 'false',
      }),
    ).toBe(false);
    expect(
      isIdempotencyMoneyKeysRequired({
        IDEMPOTENCY_REQUIRE_MONEY_KEYS: 'true',
      }),
    ).toBe(true);
    expect(
      isIdempotencyMoneyKeysRequired({ IDEMPOTENCY_REQUIRE_MONEY_KEYS: '1' }),
    ).toBe(true);
  });

  it('Tier A scope set covers hot + money create/cancel paths', () => {
    expect(IDEMPOTENCY_TIER_A_SCOPES).toHaveLength(9);
    expect(
      isIdempotencyTierAScope(IDEMPOTENCY_SCOPES.FINANCE_ORDERS_CREATE),
    ).toBe(true);
    expect(
      isIdempotencyTierAScope(IDEMPOTENCY_SCOPES.FINANCE_ORDERS_UPDATE),
    ).toBe(false);
    expect(
      isIdempotencyTierAScope(IDEMPOTENCY_SCOPES.FINANCE_LOSSES_DELETE),
    ).toBe(false);
    expect(
      isIdempotencyTierAScope(IDEMPOTENCY_SCOPES.SHOP_CURRENCY_APPLY),
    ).toBe(false);
  });

  it('rejects oversized keys', async () => {
    await expect(
      withClientIdempotency(
        mockPrisma({}),
        { shopId: 's1', scope: 'x', key: 'k'.repeat(129) },
        async () => 1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('claims, runs once, stores COMPLETED, replays from memory', async () => {
    const fn = jest.fn().mockResolvedValue({ ok: true, n: 1 });
    const prisma = mockPrisma({});
    const opts = {
      shopId: 's1',
      scope: 'finance.transactions.create',
      key: 'key-a',
      requestHash: hashIdempotencyRequest({ kind: 'SALE' }),
    };
    const a = await withClientIdempotency(prisma, opts, fn);
    const b = await withClientIdempotency(prisma, opts, fn);
    expect(a).toEqual({ ok: true, n: 1 });
    expect(b).toEqual({ ok: true, n: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyReceipt.create).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('replays COMPLETED receipt from DB when memory cold', async () => {
    clearIdempotencyMemoryCache();
    const findUnique = jest.fn().mockResolvedValue({
      status: 'COMPLETED',
      requestHash: null,
      responseJson: JSON.stringify({ id: 'stored' }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const fn = jest.fn();
    const out = await withClientIdempotency(
      mockPrisma({ findUnique }),
      { shopId: 's1', scope: 'finance.play-billing.mark-paid', key: 'replay' },
      fn,
    );
    expect(out).toEqual({ id: 'stored' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('409 when same key used with different request hash', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      status: 'COMPLETED',
      requestHash: hashIdempotencyRequest({ a: 1 }),
      responseJson: JSON.stringify({ id: 'x' }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      withClientIdempotency(
        mockPrisma({ findUnique }),
        {
          shopId: 's1',
          scope: 'finance.transactions.create',
          key: 'same',
          requestHash: hashIdempotencyRequest({ a: 2 }),
        },
        async () => ({ id: 'new' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('on P2002 race returns completed receipt from peer', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        status: 'COMPLETED',
        requestHash: null,
        responseJson: JSON.stringify({ id: 'peer' }),
        expiresAt: new Date(Date.now() + 60_000),
      });
    const fn = jest.fn();
    const out = await withClientIdempotency(
      mockPrisma({ create, findUnique }),
      { shopId: 's1', scope: 'finance.play-sessions.mark-paid', key: 'race' },
      fn,
    );
    expect(out).toEqual({ id: 'peer' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('deletes PENDING claim when handler throws', async () => {
    const del = jest.fn().mockResolvedValue({});
    const prisma = mockPrisma({ delete: del });
    await expect(
      withClientIdempotency(
        prisma,
        { shopId: 's1', scope: 'finance.transactions.create', key: 'fail' },
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');
    expect(del).toHaveBeenCalled();
  });

  it('hashIdempotencyRequest is stable for equal objects', () => {
    expect(hashIdempotencyRequest({ x: 1 })).toBe(
      hashIdempotencyRequest({ x: 1 }),
    );
    expect(hashIdempotencyRequest({ x: 1 })).not.toBe(
      hashIdempotencyRequest({ x: 2 }),
    );
  });
});
