import { BadRequestException } from '@nestjs/common';
import { PaymentOperationState, RefundState } from '@prisma/client';
import { AdyenTerminalWebhookController } from './adyen-terminal-webhook.controller';
import type { AdyenStandardWebhookItem } from './connectors/adyen-terminal.connector';
import { PaymentOperationStateService } from './payment-operation-state.service';

function item(overrides: Partial<AdyenStandardWebhookItem> = {}): AdyenStandardWebhookItem {
  return {
    additionalData: { hmacSignature: 'signed' },
    amount: { value: 1050, currency: 'PLN' },
    eventCode: 'CANCEL_OR_REFUND',
    merchantAccountCode: 'GoSpotsTestMerchant',
    merchantReference: 'refund_1',
    originalReference: '9912345678901234',
    pspReference: '8812345678901234',
    success: 'true',
    ...overrides,
  };
}

function paymentReference(pspReference = '9912345678901234'): string {
  return `adyen:v1:${Buffer.from(
    JSON.stringify({
      v: 1,
      poiId: 'S1F2-123456789',
      saleId: 'GoSpots',
      paymentServiceId: 'ABCDEF1234',
      transactionId: `tender-123.${pspReference}`,
      transactionTime: '2026-08-19T18:00:00.000Z',
      pspReference,
    }),
    'utf8',
  ).toString('base64url')}`;
}

type RefundFixture = {
  id: string;
  shopId: string;
  paymentOperationId: string;
  providerRefundId: string | null;
  state: RefundState;
  succeededAt: Date | null;
  failedAt: Date | null;
  paymentOperation: {
    id: string;
    provider: string;
    providerPaymentId: string;
  };
};

function harness(options: {
  validHmac?: boolean;
  merchantMatches?: boolean;
  existingEvent?: unknown;
  refund?: RefundFixture | null;
  successfulRefunds?: Array<{ amount: string }>;
  operationAmount?: string;
  operationState?: PaymentOperationState;
} = {}) {
  const refund: RefundFixture | null =
    options.refund === undefined
      ? {
          id: 'refund_1',
          shopId: 'shop_1',
          paymentOperationId: 'op_1',
          providerRefundId: 'adyen:pending:refund_1',
          state: RefundState.PROCESSING,
          succeededAt: null,
          failedAt: null,
          paymentOperation: {
            id: 'op_1',
            provider: 'adyen',
            providerPaymentId: paymentReference(),
          },
        }
      : options.refund;
  const connector = {
    verifyStandardWebhook: jest.fn().mockReturnValue(options.validHmac ?? true),
    configuredMerchantMatches: jest.fn().mockReturnValue(options.merchantMatches ?? true),
  };
  const transaction = {
    paymentWebhookEvent: { create: jest.fn().mockResolvedValue({ id: 'evt_1' }) },
    refund: {
      update: jest.fn().mockResolvedValue({}),
      findMany: jest
        .fn()
        .mockResolvedValue(options.successfulRefunds ?? [{ amount: '10.5000' }]),
    },
    paymentOperation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'op_1',
        amount: options.operationAmount ?? '10.5000',
        state: options.operationState ?? PaymentOperationState.CAPTURED,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    refund: { findFirst: jest.fn().mockResolvedValue(refund) },
    paymentWebhookEvent: {
      findUnique: jest.fn().mockResolvedValue(options.existingEvent ?? null),
    },
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  const states = new PaymentOperationStateService();
  const controller = new AdyenTerminalWebhookController(
    connector as never,
    prisma as never,
    states,
  );
  return { controller, connector, prisma, transaction };
}

describe('AdyenTerminalWebhookController', () => {
  test('rejects an invalid Standard webhook HMAC before touching canonical state', async () => {
    const { controller, prisma } = harness({ validHmac: false });
    await expect(
      controller.ingest({ notificationItems: [{ NotificationRequestItem: item() }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.refund.findFirst).not.toHaveBeenCalled();
  });

  test('rejects a validly signed notification from a different merchant account', async () => {
    const { controller, prisma } = harness({ merchantMatches: false });
    await expect(
      controller.ingest({ notificationItems: [{ NotificationRequestItem: item() }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.refund.findFirst).not.toHaveBeenCalled();
  });

  test('ignores valid non-refund Adyen events instead of creating cross-domain state', async () => {
    const { controller, prisma } = harness();
    await expect(
      controller.ingest({
        notificationItems: [
          { NotificationRequestItem: item({ eventCode: 'AUTHORISATION' }) },
        ],
      }),
    ).resolves.toEqual({ received: true, applied: 0, duplicates: 0, ignored: 1 });
    expect(prisma.refund.findFirst).not.toHaveBeenCalled();
  });

  test('ignores a valid refund notification that does not belong to GoSpots venue payments', async () => {
    const { controller, transaction } = harness({ refund: null });
    await expect(
      controller.ingest({ notificationItems: [{ NotificationRequestItem: item() }] }),
    ).resolves.toEqual({ received: true, applied: 0, duplicates: 0, ignored: 1 });
    expect(transaction.refund.update).not.toHaveBeenCalled();
  });

  test('deduplicates a repeated refund event before any money mutation', async () => {
    const { controller, transaction } = harness({ existingEvent: { id: 'already_applied' } });
    await expect(
      controller.ingest({ notificationItems: [{ NotificationRequestItem: item() }] }),
    ).resolves.toEqual({ received: true, applied: 0, duplicates: 1, ignored: 0 });
    expect(transaction.refund.update).not.toHaveBeenCalled();
    expect(transaction.paymentOperation.update).not.toHaveBeenCalled();
  });

  test('rejects a refund webhook whose originalReference does not match the stored Adyen payment', async () => {
    const { controller, transaction } = harness();
    await expect(
      controller.ingest({
        notificationItems: [
          { NotificationRequestItem: item({ originalReference: 'different-payment' }) },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.refund.update).not.toHaveBeenCalled();
  });

  test('applies successful full refund exactly once and advances payment to REFUNDED', async () => {
    const { controller, transaction } = harness({
      successfulRefunds: [{ amount: '10.5000' }],
      operationAmount: '10.5000',
    });
    await expect(
      controller.ingest({ notificationItems: [{ NotificationRequestItem: item() }] }),
    ).resolves.toEqual({ received: true, applied: 1, duplicates: 0, ignored: 0 });

    expect(transaction.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'refund_1' },
        data: expect.objectContaining({
          providerRefundId: '8812345678901234',
          state: RefundState.SUCCEEDED,
        }),
      }),
    );
    expect(transaction.paymentOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'op_1' },
        data: expect.objectContaining({ state: PaymentOperationState.REFUNDED }),
      }),
    );
  });

  test('successful partial refund advances payment to PARTIALLY_REFUNDED', async () => {
    const { controller, transaction } = harness({
      successfulRefunds: [{ amount: '10.5000' }],
      operationAmount: '40.0000',
    });
    await controller.ingest({ notificationItems: [{ NotificationRequestItem: item() }] });
    expect(transaction.paymentOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: PaymentOperationState.PARTIALLY_REFUNDED }),
      }),
    );
  });

  test('failed validation records provider failure and keeps the captured net payment state', async () => {
    const { controller, transaction } = harness({ successfulRefunds: [] });
    await controller.ingest({
      notificationItems: [
        {
          NotificationRequestItem: item({
            success: 'false',
            reason: 'Refund refused by provider',
          }),
        },
      ],
    });
    expect(transaction.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: RefundState.FAILED,
          errorCode: 'ADYEN_CANCEL_OR_REFUND_FAILED',
          errorMessage: 'Refund refused by provider',
        }),
      }),
    );
    expect(transaction.paymentOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: PaymentOperationState.CAPTURED }),
      }),
    );
  });

  test.each(['REFUND_FAILED', 'REFUNDED_REVERSED'])(
    '%s reverses prior refund certainty and restores captured net state',
    async (eventCode) => {
      const previousSuccess = new Date('2026-08-19T18:06:00.000Z');
      const { controller, transaction } = harness({
        refund: {
          id: 'refund_1',
          shopId: 'shop_1',
          paymentOperationId: 'op_1',
          providerRefundId: '8812345678901234',
          state: RefundState.SUCCEEDED,
          succeededAt: previousSuccess,
          failedAt: null,
          paymentOperation: {
            id: 'op_1',
            provider: 'adyen',
            providerPaymentId: paymentReference(),
          },
        },
        successfulRefunds: [],
        operationAmount: '10.5000',
        operationState: PaymentOperationState.REFUNDED,
      });

      await expect(
        controller.ingest({
          notificationItems: [
            {
              NotificationRequestItem: item({
                eventCode,
                merchantReference: undefined,
                reason: eventCode === 'REFUND_FAILED' ? 'Scheme rejected refund' : '',
              }),
            },
          ],
        }),
      ).resolves.toEqual({ received: true, applied: 1, duplicates: 0, ignored: 0 });

      expect(transaction.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            state: RefundState.FAILED,
            errorCode:
              eventCode === 'REFUND_FAILED'
                ? 'ADYEN_REFUND_FAILED'
                : 'ADYEN_REFUNDED_REVERSED',
          }),
        }),
      );
      expect(transaction.paymentOperation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            state: PaymentOperationState.CAPTURED,
            reconciliationRequired: false,
          }),
        }),
      );
    },
  );
});
