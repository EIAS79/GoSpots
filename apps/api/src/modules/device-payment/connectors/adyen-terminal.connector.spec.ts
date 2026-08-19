import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { AdyenTerminalConnector, decodeAdyenPaymentReference } from './adyen-terminal.connector';
import { PaymentConnectorRegistry } from './payment-connector.registry';

const HMAC_KEY = '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';

function config(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    ADYEN_TERMINAL_ENABLED: 'true',
    ADYEN_API_KEY: 'test_api_key',
    ADYEN_MERCHANT_ACCOUNT: 'GoSpotsTestMerchant',
    ADYEN_ENVIRONMENT: 'test',
    ADYEN_TERMINAL_BASE_URL: 'https://adyen.test/v1',
    ADYEN_TERMINAL_SALE_ID: 'GoSpots',
    ADYEN_TERMINAL_TIMEOUT_MS: '151000',
    ADYEN_STANDARD_WEBHOOK_HMAC_KEY: HMAC_KEY,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body === null ? '' : JSON.stringify(body)),
  };
}

function installHttp(connector: AdyenTerminalConnector, responses: unknown[]) {
  const mock = jest.fn();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  (connector as unknown as { http: unknown }).http = mock;
  return mock;
}

function paymentSuccess() {
  return {
    SaleToPOIResponse: {
      PaymentResponse: {
        POIData: {
          POITransactionID: {
            TransactionID: 'tender-123.9912345678901234',
            TimeStamp: '2026-08-19T18:00:00.000Z',
          },
        },
        Response: {
          Result: 'Success',
          AdditionalResponse: 'pspReference=9912345678901234&merchantReference=op_1',
        },
      },
    },
  };
}

describe('AdyenTerminalConnector', () => {
  test('registers as the venue payment provider and creates a synchronous cloud payment', async () => {
    const registry = new PaymentConnectorRegistry();
    const connector = new AdyenTerminalConnector(config(), registry);
    connector.onModuleInit();
    expect(registry.resolve('ADYEN')).toBe(connector);
    expect(connector.capabilities()).toMatchObject({
      payments: true,
      terminal: true,
      refunds: true,
      inPersonTerminal: true,
      webhookReconciliation: true,
    });

    const http = installHttp(connector, [jsonResponse(paymentSuccess())]);
    const result = await connector.createPayment({
      operationId: 'op_1',
      idempotencyKey: 'idem_1',
      amount: '40.0000',
      currency: 'PLN',
      terminalExternalId: 'S1F2-123456789',
    });

    expect(result.state).toBe('CAPTURED');
    expect(decodeAdyenPaymentReference(result.providerPaymentId)).toMatchObject({
      poiId: 'S1F2-123456789',
      pspReference: '9912345678901234',
      transactionId: 'tender-123.9912345678901234',
    });
    const [url, init] = http.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe(
      'https://adyen.test/v1/merchants/GoSpotsTestMerchant/devices/S1F2-123456789/sync',
    );
    expect(init.headers['X-API-Key']).toBe('test_api_key');
    const payload = JSON.parse(init.body) as any;
    expect(payload.SaleToPOIRequest.MessageHeader).toMatchObject({
      ProtocolVersion: '3.0',
      MessageClass: 'Service',
      MessageCategory: 'Payment',
      MessageType: 'Request',
      SaleID: 'GoSpots',
      POIID: 'S1F2-123456789',
    });
    expect(payload.SaleToPOIRequest.PaymentRequest.PaymentTransaction.AmountsReq).toEqual({
      Currency: 'PLN',
      RequestedAmount: 40,
    });
    expect(payload.SaleToPOIRequest.PaymentRequest.SaleData.SaleTransactionID.TransactionID).toBe(
      'op_1',
    );
  });

  test('preserves UNKNOWN on transport failure and reconciles the exact payment with TransactionStatus', async () => {
    const connector = new AdyenTerminalConnector(config(), new PaymentConnectorRegistry());
    const failedHttp = jest.fn().mockRejectedValue(new Error('socket timeout'));
    (connector as unknown as { http: unknown }).http = failedHttp;

    const first = await connector.createPayment({
      operationId: 'op_timeout',
      idempotencyKey: 'idem_timeout',
      amount: '12.34',
      currency: 'PLN',
      terminalExternalId: 'S1F2-123456789',
    });
    expect(first.state).toBe('UNKNOWN');

    const reference = decodeAdyenPaymentReference(first.providerPaymentId);
    const statusResponse = {
      SaleToPOIResponse: {
        TransactionStatusResponse: {
          Response: { Result: 'Success' },
          RepeatedMessageResponse: {
            RepeatedResponseMessageBody: paymentSuccess().SaleToPOIResponse,
          },
        },
      },
    };
    const http = installHttp(connector, [jsonResponse(statusResponse)]);
    const reconciled = await connector.getPayment({ providerPaymentId: first.providerPaymentId });
    expect(reconciled.state).toBe('CAPTURED');

    const payload = JSON.parse((http.mock.calls[0][1] as { body: string }).body) as any;
    expect(payload.SaleToPOIRequest.TransactionStatusRequest.MessageReference).toEqual({
      MessageCategory: 'Payment',
      SaleID: reference.saleId,
      ServiceID: reference.paymentServiceId,
    });
  });

  test('maps a terminal refusal to FAILED without treating it as an uncertain payment', async () => {
    const connector = new AdyenTerminalConnector(config(), new PaymentConnectorRegistry());
    installHttp(connector, [
      jsonResponse({
        SaleToPOIResponse: {
          PaymentResponse: {
            Response: {
              Result: 'Failure',
              ErrorCondition: 'Refusal',
              AdditionalResponse: 'refusalReason=Declined',
            },
          },
        },
      }),
    ]);
    await expect(
      connector.createPayment({
        operationId: 'op_decline',
        idempotencyKey: 'idem_decline',
        amount: '10.00',
        currency: 'PLN',
        terminalExternalId: 'S1F2-123456789',
      }),
    ).resolves.toMatchObject({ state: 'FAILED', errorCode: 'Refusal', errorMessage: 'Declined' });
  });

  test('uses AbortRequest then TransactionStatus instead of assuming cancellation succeeded', async () => {
    const connector = new AdyenTerminalConnector(config(), new PaymentConnectorRegistry());
    const firstHttp = installHttp(connector, [jsonResponse(paymentSuccess())]);
    const payment = await connector.createPayment({
      operationId: 'op_cancel',
      idempotencyKey: 'idem_cancel',
      amount: '10.00',
      currency: 'PLN',
      terminalExternalId: 'S1F2-123456789',
    });
    expect(firstHttp).toHaveBeenCalledTimes(1);

    const status = {
      SaleToPOIResponse: {
        TransactionStatusResponse: {
          Response: { Result: 'Success' },
          RepeatedMessageResponse: {
            RepeatedResponseMessageBody: {
              PaymentResponse: {
                Response: { Result: 'Failure', ErrorCondition: 'Aborted' },
              },
            },
          },
        },
      },
    };
    const http = installHttp(connector, [jsonResponse(null), jsonResponse(status)]);
    const result = await connector.cancelPayment({ providerPaymentId: payment.providerPaymentId });
    expect(result.state).toBe('CANCELED');
    const abortPayload = JSON.parse((http.mock.calls[0][1] as { body: string }).body) as any;
    expect(abortPayload.SaleToPOIRequest.MessageHeader.MessageCategory).toBe('Abort');
    expect(abortPayload.SaleToPOIRequest.AbortRequest.AbortReason).toBe('MerchantAbort');
  });

  test('sends referenced refunds as ReversalRequest and waits for CANCEL_OR_REFUND webhook', async () => {
    const connector = new AdyenTerminalConnector(config(), new PaymentConnectorRegistry());
    installHttp(connector, [jsonResponse(paymentSuccess())]);
    const payment = await connector.createPayment({
      operationId: 'op_refund',
      idempotencyKey: 'idem_refund_payment',
      amount: '40.00',
      currency: 'PLN',
      terminalExternalId: 'S1F2-123456789',
    });

    const http = installHttp(connector, [
      jsonResponse({
        SaleToPOIResponse: {
          ReversalResponse: {
            POIData: {
              POITransactionID: {
                TransactionID: 'refund-tender.8812345678901234',
                TimeStamp: '2026-08-19T18:05:00.000Z',
              },
            },
            Response: {
              Result: 'Success',
              AdditionalResponse: 'pspReference=8812345678901234',
            },
          },
        },
      }),
    ]);
    const refund = await connector.refundPayment({
      refundId: 'refund_1',
      paymentProviderId: payment.providerPaymentId,
      idempotencyKey: 'idem_refund',
      amount: '10.50',
      currency: 'PLN',
    });
    expect(refund).toMatchObject({
      providerRefundId: '8812345678901234',
      state: 'PROCESSING',
      providerPayload: { awaitingWebhook: 'CANCEL_OR_REFUND' },
    });
    const payload = JSON.parse((http.mock.calls[0][1] as { body: string }).body) as any;
    expect(payload.SaleToPOIRequest.MessageHeader.MessageCategory).toBe('Reversal');
    expect(payload.SaleToPOIRequest.ReversalRequest).toMatchObject({
      ReversedAmount: 10.5,
      ReversalReason: 'MerchantCancel',
      SaleData: { SaleTransactionID: { TransactionID: 'refund_1' } },
    });
    expect(payload.SaleToPOIRequest.ReversalRequest.OriginalPOITransaction.POITransactionID).toMatchObject({
      TransactionID: 'tender-123.9912345678901234',
      TimeStamp: '2026-08-19T18:00:00.000Z',
    });
  });

  test('rejects sub-minor-unit amounts before contacting Adyen', async () => {
    const connector = new AdyenTerminalConnector(config(), new PaymentConnectorRegistry());
    const http = installHttp(connector, []);
    const result = await connector.createPayment({
      operationId: 'op_precision',
      idempotencyKey: 'idem_precision',
      amount: '1.0010',
      currency: 'PLN',
      terminalExternalId: 'S1F2-123456789',
    });
    expect(result).toMatchObject({ state: 'FAILED', errorCode: 'INVALID_TERMINAL_AMOUNT' });
    expect(http).not.toHaveBeenCalled();
  });

  test('verifies Adyen Standard webhook HMAC with constant-time comparison', () => {
    const connector = new AdyenTerminalConnector(config(), new PaymentConnectorRegistry());
    const item = {
      additionalData: { hmacSignature: '' },
      amount: { value: 1130, currency: 'EUR' },
      pspReference: '7914073381342284',
      originalReference: '',
      merchantAccountCode: 'TestMerchant',
      merchantReference: 'TestPayment-1407325143704',
      eventCode: 'AUTHORISATION',
      success: 'true',
    };
    const payload = [
      item.pspReference,
      item.originalReference,
      item.merchantAccountCode,
      item.merchantReference,
      item.amount.value,
      item.amount.currency,
      item.eventCode,
      item.success,
    ].join(':');
    item.additionalData.hmacSignature = createHmac('sha256', Buffer.from(HMAC_KEY, 'hex'))
      .update(payload, 'utf8')
      .digest('base64');
    expect(connector.verifyStandardWebhook(item)).toBe(true);
    item.success = 'false';
    expect(connector.verifyStandardWebhook(item)).toBe(false);
  });

  test('readiness stays false until all external Adyen test-account configuration exists', async () => {
    const connector = new AdyenTerminalConnector(
      config({ ADYEN_STANDARD_WEBHOOK_HMAC_KEY: '' }),
      new PaymentConnectorRegistry(),
    );
    await expect(connector.readiness()).resolves.toMatchObject({ ready: false, ok: false });
  });
});
