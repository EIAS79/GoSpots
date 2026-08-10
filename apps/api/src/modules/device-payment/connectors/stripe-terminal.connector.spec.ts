import { ConfigService } from '@nestjs/config';
import { PaymentConnectorRegistry } from './payment-connector.registry';
import { StripeTerminalConnector } from './stripe-terminal.connector';

function config(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'STRIPE_TERMINAL_ENABLED') return 'true';
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_fake';
      if (key === 'STRIPE_TERMINAL_WEBHOOK_SECRET') return 'whsec_fake';
      return undefined;
    },
  } as unknown as ConfigService;
}

function installClient(connector: StripeTerminalConnector, client: unknown) {
  (connector as unknown as { client: unknown }).client = client;
}

function baseClient() {
  return {
    paymentIntents: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method' }),
      retrieve: jest
        .fn()
        .mockResolvedValue({
          id: 'pi_1',
          status: 'succeeded',
          amount_received: 4000,
        }),
      cancel: jest.fn().mockResolvedValue({ id: 'pi_1', status: 'canceled' }),
    },
    terminal: {
      readers: {
        processPaymentIntent: jest.fn().mockResolvedValue({
          id: 'tmr_1',
          status: 'online',
          action: { status: 'in_progress' },
        }),
        cancelAction: jest.fn().mockResolvedValue({ id: 'tmr_1' }),
      },
      locations: { list: jest.fn().mockResolvedValue({ data: [] }) },
    },
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_1', status: 'succeeded' }),
    },
    webhooks: { constructEvent: jest.fn() },
  };
}

describe('StripeTerminalConnector', () => {
  test('registers itself and starts one server-driven reader payment', async () => {
    const registry = new PaymentConnectorRegistry();
    const connector = new StripeTerminalConnector(config(), registry);
    connector.onModuleInit();
    expect(registry.resolve('STRIPE')).toBe(connector);
    const client = baseClient();
    installClient(connector, client);

    const result = await connector.createPayment({
      operationId: 'op_1',
      idempotencyKey: 'idem_1',
      amount: '40.0000',
      currency: 'PLN',
      terminalExternalId: 'tmr_1',
    });

    expect(result).toMatchObject({
      providerPaymentId: 'pi_1',
      state: 'PROCESSING',
    });
    expect(client.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4000,
        currency: 'pln',
        payment_method_types: ['card_present'],
      }),
      { idempotencyKey: 'gospots:terminal:pi:idem_1' },
    );
    expect(client.terminal.readers.processPaymentIntent).toHaveBeenCalledWith(
      'tmr_1',
      expect.objectContaining({ payment_intent: 'pi_1' }),
      { idempotencyKey: 'gospots:terminal:reader:idem_1' },
    );
  });

  test('keeps an uncertain reader handoff UNKNOWN using the same PaymentIntent', async () => {
    const connector = new StripeTerminalConnector(
      config(),
      new PaymentConnectorRegistry(),
    );
    const client = baseClient();
    client.terminal.readers.processPaymentIntent.mockRejectedValue({
      type: 'StripeConnectionError',
      message: 'timeout',
    });
    installClient(connector, client);

    const result = await connector.createPayment({
      operationId: 'op_timeout',
      idempotencyKey: 'idem_timeout',
      amount: '12.34',
      currency: 'PLN',
      terminalExternalId: 'tmr_1',
    });
    expect(result).toMatchObject({
      providerPaymentId: 'pi_1',
      state: 'UNKNOWN',
    });
  });

  test('reconciles a succeeded PaymentIntent as CAPTURED', async () => {
    const connector = new StripeTerminalConnector(
      config(),
      new PaymentConnectorRegistry(),
    );
    const client = baseClient();
    installClient(connector, client);
    await expect(
      connector.getPayment({ providerPaymentId: 'pi_1' }),
    ).resolves.toMatchObject({
      providerPaymentId: 'pi_1',
      state: 'CAPTURED',
    });
  });

  test('refund uses minor units and provider idempotency', async () => {
    const connector = new StripeTerminalConnector(
      config(),
      new PaymentConnectorRegistry(),
    );
    const client = baseClient();
    installClient(connector, client);
    const result = await connector.refundPayment({
      refundId: 'rf_local',
      paymentProviderId: 'pi_1',
      idempotencyKey: 'refund-idem',
      amount: '10.50',
      currency: 'PLN',
    });
    expect(result).toMatchObject({
      providerRefundId: 're_1',
      state: 'SUCCEEDED',
    });
    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 1050 }),
      { idempotencyKey: 'gospots:terminal:refund:refund-idem' },
    );
  });

  test('rejects sub-grosz PLN precision instead of floating rounding', async () => {
    const connector = new StripeTerminalConnector(
      config(),
      new PaymentConnectorRegistry(),
    );
    const client = baseClient();
    installClient(connector, client);
    const result = await connector.createPayment({
      operationId: 'op_precision',
      idempotencyKey: 'idem_precision',
      amount: '1.0010',
      currency: 'PLN',
      terminalExternalId: 'tmr_1',
    });
    expect(result).toMatchObject({
      state: 'FAILED',
      errorCode: 'INVALID_TERMINAL_AMOUNT',
    });
    expect(client.paymentIntents.create).not.toHaveBeenCalled();
  });
});
