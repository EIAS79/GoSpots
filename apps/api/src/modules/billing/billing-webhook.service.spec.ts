import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { BillingWebhookService } from './billing-webhook.service';

describe('BillingWebhookService inbox dedupe', () => {
  function makeService(createImpl: jest.Mock) {
    const prisma = {
      billingWebhookEvent: {
        create: createImpl,
      },
    };
    const config = { get: jest.fn() } as unknown as ConfigService;
    const stripe = {
      constructWebhookEvent: jest.fn().mockReturnValue({
        id: 'evt_test_1',
        type: 'invoice.paid',
        data: { object: { metadata: { shop_id: 'shop_1' }, id: 'in_1' } },
      }),
    };
    const mollie = {
      retrievePayment: jest.fn(),
    };

    const svc = new BillingWebhookService(
      prisma as never,
      config,
      stripe as never,
      mollie as never,
      {} as never, // registry
      {} as never, // entitlements
      {} as never, // notifications
      {} as never, // orchestrator
      {} as never, // audit
    );

    return { svc, stripe, prisma };
  }

  it('returns duplicate:true when (provider, eventId) already exists', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['provider', 'eventId'] },
      }),
    );
    const { svc, stripe } = makeService(create);

    const result = await svc.ingestStripe(
      Buffer.from('{"id":"evt_test_1"}'),
      'sig_test',
    );

    expect(stripe.constructWebhookEvent).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'STRIPE',
          eventId: 'evt_test_1',
          status: 'RECEIVED',
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      duplicate: true,
      eventId: 'evt_test_1',
    });
  });

  it('inserts RECEIVED on first delivery', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'row_1' });
    const { svc } = makeService(create);

    const result = await svc.ingestStripe(
      Buffer.from('{"id":"evt_test_1"}'),
      'sig_test',
    );

    expect(result).toEqual({ ok: true, eventId: 'evt_test_1' });
    expect(result).not.toHaveProperty('duplicate');
  });
});
