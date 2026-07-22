import { createHash, createHmac } from 'crypto';
import {
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';

describe('BillingService webhook edges', () => {
  const audit = {
    record: jest.fn(),
    recordForShop: jest.fn(),
  };
  const rates = {
    getRate: jest.fn(),
    convertAmount: jest.fn(),
  };
  const lemon = {
    isConfigured: () => true,
    createCheckout: jest.fn(),
    getCustomerPortalUrl: jest.fn(),
  };

  function makeService(prisma: Record<string, unknown>) {
    const config = {
      get: (key: string) =>
        key === 'LEMON_SQUEEZY_WEBHOOK_SECRET' ? 'test-secret' : undefined,
    } as unknown as ConfigService;
    return new BillingService(
      prisma as never,
      lemon as never,
      config,
      audit as never,
      rates as never,
    );
  }

  function activeSubPrisma(overrides: Record<string, unknown> = {}) {
    const create = jest.fn().mockResolvedValue({ id: 'receipt' });
    const findUnique = jest.fn().mockResolvedValue({
      packId: 'gaming',
      addOnRows: [],
      staffSeatQuantity: 0,
      currentPeriodEnd: null,
      trialEndsAt: null,
      pendingPackId: null,
      ...overrides,
    });
    const subUpdate = jest.fn().mockResolvedValue({ id: 'sub_1' });
    const shopUpdate = jest.fn().mockResolvedValue({});
    return {
      create,
      findUnique,
      subUpdate,
      shopUpdate,
      prisma: {
        billingWebhookEvent: { create },
        subscription: { findUnique, update: subUpdate },
        shop: { update: shopUpdate },
        subscriptionAddOn: {
          deleteMany: jest.fn().mockResolvedValue({}),
          createMany: jest.fn().mockResolvedValue({}),
        },
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolveWebhookEventId prefers meta.event_id', () => {
    const svc = makeService({});
    expect(
      svc.resolveWebhookEventId({
        meta: { event_id: 'evt_1', event_name: 'subscription_updated' },
        data: { id: 'sub_1' },
      }),
    ).toBe('evt_1');
  });

  it('resolveWebhookEventId falls back to raw body hash', () => {
    const svc = makeService({});
    const raw = Buffer.from('{"meta":{"event_name":"x"}}');
    const id = svc.resolveWebhookEventId({ meta: { event_name: 'x' } }, raw);
    expect(id).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('verifySignature accepts valid HMAC', () => {
    const svc = makeService({});
    const raw = Buffer.from('payload');
    const sig = createHmac('sha256', 'test-secret').update(raw).digest('hex');
    expect(() => svc.verifySignature(raw, sig)).not.toThrow();
  });

  it('verifySignature rejects invalid HMAC with 401 (no receipt path)', () => {
    const create = jest.fn();
    const svc = makeService({ billingWebhookEvent: { create } });
    expect(() => svc.verifySignature(Buffer.from('x'), 'deadbeef')).toThrow(
      UnauthorizedException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('verifySignature rejects missing signature with 401', () => {
    const create = jest.fn();
    const svc = makeService({ billingWebhookEvent: { create } });
    expect(() => svc.verifySignature(Buffer.from('x'), undefined)).toThrow(
      UnauthorizedException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('verifySignature rejects missing secret with 503 (never accepts unsigned)', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const svc = new BillingService(
      {} as never,
      lemon as never,
      config,
      audit as never,
      rates as never,
    );
    expect(() => svc.verifySignature(Buffer.from('x'), 'sig')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('handleWebhook skips side effects on duplicate event id (P2002)', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.0.0',
      }),
    );
    const update = jest.fn();
    const svc = makeService({
      billingWebhookEvent: { create },
      subscription: { findUnique: jest.fn(), update },
      shop: { update: jest.fn() },
    });

    const result = await svc.handleWebhook({
      meta: {
        event_name: 'subscription_updated',
        event_id: 'dup-1',
        custom_data: { shop_id: 'shop_1' },
      },
      data: {
        id: 'ls_sub',
        attributes: { status: 'active' },
      },
    });

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(update).not.toHaveBeenCalled();
    expect(audit.recordForShop).not.toHaveBeenCalled();
  });

  it('duplicate after successful process still no-ops', async () => {
    const { create, subUpdate, prisma } = activeSubPrisma();
    create
      .mockResolvedValueOnce({ id: 'receipt' })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );
    const svc = makeService(prisma);

    const payload = {
      meta: {
        event_name: 'subscription_created',
        event_id: 'evt-replay',
        custom_data: { shop_id: 'shop_1', pack_id: 'gaming' },
      },
      data: {
        id: 'ls_sub',
        attributes: { status: 'active', renews_at: '2030-01-01T00:00:00Z' },
      },
    };

    await expect(svc.handleWebhook(payload)).resolves.toEqual({ ok: true });
    await expect(svc.handleWebhook(payload)).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
    expect(subUpdate).toHaveBeenCalledTimes(1);
    expect(audit.recordForShop).toHaveBeenCalledTimes(1);
  });

  it('handleWebhook inserts receipt then updates subscription once', async () => {
    const { create, subUpdate, prisma } = activeSubPrisma();
    const svc = makeService(prisma);

    const result = await svc.handleWebhook({
      meta: {
        event_name: 'subscription_created',
        event_id: 'evt-new',
        custom_data: { shop_id: 'shop_1', pack_id: 'gaming' },
      },
      data: {
        id: 'ls_sub',
        attributes: { status: 'active', renews_at: '2030-01-01T00:00:00Z' },
      },
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'lemon_squeezy',
          eventId: 'evt-new',
          shopId: 'shop_1',
        }),
      }),
    );
    expect(subUpdate).toHaveBeenCalledTimes(1);
    expect(subUpdate.mock.calls[0][0].data.status).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });

  it('concurrent duplicate creates: only one applies (second P2002)', async () => {
    let inserts = 0;
    const { subUpdate, prisma } = activeSubPrisma();
    prisma.billingWebhookEvent.create = jest
      .fn()
      .mockImplementation(async () => {
        inserts += 1;
        if (inserts > 1) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: '6.0.0',
          });
        }
        return { id: 'receipt' };
      });
    const svc = makeService(prisma);

    const payload = {
      meta: {
        event_name: 'subscription_updated',
        event_id: 'race-1',
        custom_data: { shop_id: 'shop_1' },
      },
      data: { id: 'ls', attributes: { status: 'active' } },
    };

    const [a, b] = await Promise.all([
      svc.handleWebhook(payload),
      svc.handleWebhook(payload),
    ]);

    const outcomes = [a, b].sort((x, y) =>
      JSON.stringify(x).localeCompare(JSON.stringify(y)),
    );
    expect(outcomes).toEqual([
      { ok: true, duplicate: true },
      { ok: true },
    ]);
    expect(subUpdate).toHaveBeenCalledTimes(1);
  });

  it('unknown event type acks with receipt and no mutation', async () => {
    const { create, findUnique, subUpdate, prisma } = activeSubPrisma();
    const svc = makeService(prisma);

    const result = await svc.handleWebhook({
      meta: {
        event_name: 'order_created',
        event_id: 'evt-unknown',
        custom_data: { shop_id: 'shop_1' },
      },
      data: { id: 'ord_1', attributes: { status: 'paid' } },
    });

    expect(result).toEqual({ ok: true, ignored: true });
    expect(create).toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
    expect(audit.recordForShop).not.toHaveBeenCalled();
  });

  it('empty event name acks without mutation', async () => {
    const { findUnique, subUpdate, prisma } = activeSubPrisma();
    const svc = makeService(prisma);

    const result = await svc.handleWebhook({
      meta: { event_id: 'evt-empty', custom_data: { shop_id: 'shop_1' } },
      data: { attributes: { status: 'active' } },
    });

    expect(result).toEqual({ ok: true, ignored: true });
    expect(findUnique).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it('missing shop_id acks without subscription mutation', async () => {
    const { findUnique, subUpdate, prisma } = activeSubPrisma();
    const svc = makeService(prisma);

    const result = await svc.handleWebhook({
      meta: {
        event_name: 'subscription_updated',
        event_id: 'evt-no-shop',
      },
      data: { id: 'ls', attributes: { status: 'active' } },
    });

    expect(result).toEqual({ ok: true, ignored: true });
    expect(findUnique).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it('missing attributes still processes safely (defaults)', async () => {
    const { subUpdate, prisma } = activeSubPrisma();
    const svc = makeService(prisma);

    const result = await svc.handleWebhook({
      meta: {
        event_name: 'subscription_updated',
        event_id: 'evt-sparse',
        custom_data: { shop_id: 'shop_1' },
      },
      data: { id: 'ls_sub' },
    });

    expect(result).toEqual({ ok: true });
    expect(subUpdate).toHaveBeenCalledTimes(1);
    expect(subUpdate.mock.calls[0][0].data.status).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(subUpdate.mock.calls[0][0].data.currentPeriodEnd).toBeNull();
  });

  it('invalid renews_at does not throw', async () => {
    const { subUpdate, prisma } = activeSubPrisma();
    const svc = makeService(prisma);

    await expect(
      svc.handleWebhook({
        meta: {
          event_name: 'subscription_updated',
          event_id: 'evt-bad-date',
          custom_data: { shop_id: 'shop_1' },
        },
        data: {
          id: 'ls',
          attributes: { status: 'active', renews_at: 'not-a-date' },
        },
      }),
    ).resolves.toEqual({ ok: true });
    expect(subUpdate.mock.calls[0][0].data.currentPeriodEnd).toBeNull();
  });

  it('non-object payload returns ignored without receipt', async () => {
    const create = jest.fn();
    const svc = makeService({ billingWebhookEvent: { create } });
    await expect(svc.handleWebhook(null as never)).resolves.toEqual({
      ok: true,
      ignored: true,
    });
    expect(create).not.toHaveBeenCalled();
  });
});
