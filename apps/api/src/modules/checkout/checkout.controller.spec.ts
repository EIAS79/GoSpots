import type { PrismaService } from '../../prisma/prisma.service';
import { clearIdempotencyMemoryCache } from '../../common/idempotency.util';
import { CheckoutController } from './checkout.controller';
import type { CheckoutPaymentService } from './checkout-payment.service';
import type { CheckoutService } from './checkout.service';
import type { GuestCheckMergeService } from './guest-check-merge.service';

type Receipt = {
  status: string;
  requestHash: string | null;
  responseJson: string | null;
  expiresAt: Date | null;
};

function fakePrisma() {
  const store = new Map<string, Receipt>();
  const composite = (where: any) => {
    const value = where.shopId_scope_key;
    return `${value.shopId}:${value.scope}:${value.key}`;
  };
  return {
    idempotencyReceipt: {
      findUnique: jest.fn(
        async ({ where }: any) => store.get(composite(where)) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.shopId}:${data.scope}:${data.key}`;
        if (store.has(key)) {
          const error = new Error('unique');
          (error as any).code = 'P2002';
          throw error;
        }
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
  } as unknown as PrismaService;
}

function makeController(
  checkout: CheckoutService,
  payments = {} as CheckoutPaymentService,
  merges = {} as GuestCheckMergeService,
) {
  return new CheckoutController(checkout, payments, merges, fakePrisma());
}

const owner = {
  sub: 'owner-1',
  shopId: 'shop-a',
  shopRole: 'OWNER',
  perms: '*',
} as any;

const req = { correlationId: 'corr_12345678' };

describe('CheckoutController settlement idempotency', () => {
  beforeEach(() => clearIdempotencyMemoryCache());

  it('replays repeated create with the same key instead of creating a duplicate settlement', async () => {
    const checkout = {
      createSettlement: jest.fn().mockResolvedValue({
        id: 'settlement-1',
        state: 'CALCULATED',
        total: '42.0000',
      }),
    } as unknown as CheckoutService;
    const controller = makeController(checkout);

    const first = await controller.createSettlement(
      owner,
      'check-1',
      { expectedVersion: 3 },
      'settle-key-123',
      req,
    );
    const second = await controller.createSettlement(
      owner,
      'check-1',
      { expectedVersion: 3 },
      'settle-key-123',
      req,
    );

    expect(second).toEqual(first);
    expect(checkout.createSettlement).toHaveBeenCalledTimes(1);
  });

  it('requires Idempotency-Key for settlement creation', async () => {
    const checkout = {
      createSettlement: jest.fn(),
    } as unknown as CheckoutService;
    const controller = makeController(checkout);

    await expect(
      controller.createSettlement(
        owner,
        'check-1',
        { expectedVersion: 3 },
        undefined,
        req,
      ),
    ).rejects.toThrow('Idempotency-Key header is required');
    expect(checkout.createSettlement).not.toHaveBeenCalled();
  });

  it('replays a repeated allocation request instead of recording a second payment', async () => {
    const checkout = {} as CheckoutService;
    const payments = {
      createPayment: jest.fn().mockResolvedValue({
        settlementId: 'settlement-1',
        state: 'PARTIALLY_PAID',
        paidAmount: '25.0000',
        amountDue: '75.0000',
      }),
    } as unknown as CheckoutPaymentService;
    const controller = makeController(checkout, payments);
    const dto = {
      expectedCheckVersion: 8,
      method: 'CASH',
      allocationKind: 'CUSTOM',
      allocations: [{ snapshotId: 'line-1', amount: '25.0000' }],
    } as any;

    const first = await controller.createPayment(
      owner,
      'settlement-1',
      dto,
      'payment-key-123',
      req,
    );
    const replay = await controller.createPayment(
      owner,
      'settlement-1',
      dto,
      'payment-key-123',
      req,
    );

    expect(replay).toEqual(first);
    expect(payments.createPayment).toHaveBeenCalledTimes(1);
  });
});
