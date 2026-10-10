import {
  CheckoutPaymentMethod,
  CheckoutPaymentStatus,
  PaymentAllocationKind,
  Prisma,
} from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { SettlementStateService } from './settlement-state.service';

function d(value: string | number) {
  return new Prisma.Decimal(value);
}

describe('CheckoutPaymentService', () => {
  it.each(['OWNER', 'CASHIER'] as const)(
    'rejects unauthenticated-by-provider MANUAL_CARD for %s before any DB write',
    async (shopRole) => {
      const prisma: any = { $transaction: jest.fn() };
      const flags: any = { isFeatureEnabled: jest.fn() };
      const service = new CheckoutPaymentService(
        prisma,
        flags,
        new PaymentAllocationService(),
        new SettlementStateService(),
        { enqueue: jest.fn() } as any,
        { record: jest.fn() } as any,
        { requireSessionForCashPayment: jest.fn() } as any,
      );
      const actor = {
        sub: 'operator-1',
        shopId: 'shop-1',
        shopRole,
        perms: '*',
      } as JwtAccessPayload;
      await expect(
        service.createPayment(actor, 'settlement-1', {
          expectedCheckVersion: 1,
          method: CheckoutPaymentMethod.MANUAL_CARD,
          allocationKind: PaymentAllocationKind.REMAINING,
          allocations: [{ snapshotId: 'line-1', amount: '10.0000' }],
        }),
      ).rejects.toThrow(/prohibited without verified provider capture/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(flags.isFeatureEnabled).not.toHaveBeenCalled();
    },
  );
  it('supports partial cash then verified captured-provider remainder without duplicating revenue', async () => {
    const settlement: any = {
      id: 'settlement-1',
      shopId: 'shop-1',
      guestCheckId: 'check-1',
      state: 'CALCULATED',
      total: d(100),
      amountDue: d(100),
      currency: 'PLN',
      guestCheck: {
        id: 'check-1',
        status: 'OPEN',
        version: 7,
        currentSettlementId: 'settlement-1',
        shopOrders: [],
        playSessions: [],
        reservations: [],
      },
      snapshots: [
        {
          id: 'line-1',
          position: 0,
          sourceType: 'SHOP_ORDER',
          sourceId: 'order-1',
          lineReference: 'line-1',
          description: 'Food',
          quantity: 1,
          finalAmount: d(40),
          currency: 'PLN',
          allocations: [],
        },
        {
          id: 'line-2',
          position: 1,
          sourceType: 'PLAY_SESSION',
          sourceId: 'play-1',
          lineReference: 'play-1',
          description: 'Billiards',
          quantity: 1,
          finalAmount: d(60),
          currency: 'PLN',
          allocations: [],
        },
      ],
      payments: [],
    };

    let paymentCounter = 0;
    const transactionCreate = jest.fn();
    const ledgerEntryCreate = jest.fn();
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: settlement.id }]),
      checkSettlement: {
        findFirst: jest.fn(async () => settlement),
        update: jest.fn(async ({ data }: any) => {
          settlement.amountDue = data.amountDue;
          settlement.state = data.state;
          return settlement;
        }),
      },
      guestCheck: {
        updateMany: jest.fn(async ({ where }: any) => {
          if (where.version !== settlement.guestCheck.version) return { count: 0 };
          settlement.guestCheck.version += 1;
          return { count: 1 };
        }),
      },
      paymentOperation: {
        findFirst: jest.fn().mockResolvedValue({
          amount: d(60),
          currency: 'PLN',
          checkoutPaymentId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        create: jest.fn(async ({ data }: any) => {
          paymentCounter += 1;
          const payment = {
            id: `payment-${paymentCounter}`,
            ...data,
            failedAt: null,
            createdAt: new Date('2026-08-10T00:00:00Z'),
            updatedAt: new Date('2026-08-10T00:00:00Z'),
            allocations: [],
          };
          settlement.payments.push(payment);
          return payment;
        }),
      },
      paymentAllocation: {
        createMany: jest.fn(async ({ data }: any) => {
          for (const allocation of data) {
            const payment = settlement.payments.find(
              (row: any) => row.id === allocation.paymentId,
            );
            const hydrated = {
              id: `allocation-${payment.allocations.length + 1}`,
              ...allocation,
              createdAt: new Date('2026-08-10T00:00:00Z'),
            };
            payment.allocations.push(hydrated);
            const line = settlement.snapshots.find(
              (row: any) => row.id === allocation.snapshotId,
            );
            line.allocations.push({
              amount: allocation.amount,
              payment: { status: CheckoutPaymentStatus.SUCCESS },
            });
          }
          return { count: data.length };
        }),
      },
      transaction: { create: transactionCreate },
      ledgerEntry: { create: ledgerEntryCreate },
      domainEventOutbox: { create: jest.fn() },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const outbox: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const cash: any = {
      requireSessionForCashPayment: jest.fn().mockResolvedValue('session-1'),
      recordCashSale: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    };
    const service = new CheckoutPaymentService(
      prisma,
      flags,
      new PaymentAllocationService(),
      new SettlementStateService(),
      outbox,
      audit,
      cash,
    );
    const actor = {
      sub: 'owner-1',
      shopId: 'shop-1',
      shopRole: 'OWNER',
      perms: '*',
    } as JwtAccessPayload;

    const partial = await service.createPayment(actor, settlement.id, {
      expectedCheckVersion: 7,
      method: CheckoutPaymentMethod.CASH,
      allocationKind: PaymentAllocationKind.LINE,
      allocations: [{ snapshotId: 'line-1', amount: '40.0000' }],
    });
    expect(partial.state).toBe('PARTIALLY_PAID');
    expect(partial.amountDue).toBe('60.0000');
    expect(partial.guestCheckVersion).toBe(8);
    expect(cash.requireSessionForCashPayment).toHaveBeenCalledTimes(1);
    expect(cash.recordCashSale).toHaveBeenCalledTimes(1);
    expect(cash.recordCashSale.mock.calls[0][1]).toMatchObject({
      shopId: 'shop-1',
      cashSessionId: 'session-1',
      paymentId: 'payment-1',
      currency: 'PLN',
    });
    expect(cash.recordCashSale.mock.calls[0][1].amount.toFixed(4)).toBe(
      '40.0000',
    );

    const capturedDto = {
      expectedCheckVersion: 8,
      method: CheckoutPaymentMethod.MANUAL_CARD,
      allocationKind: PaymentAllocationKind.REMAINING,
      allocations: [{ snapshotId: 'line-2', amount: '60.0000' }],
    };

    // Neither a missing capture nor a mismatched amount may create financial facts.
    tx.paymentOperation.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.recordCapturedProviderPayment(
        actor,
        settlement.id,
        capturedDto,
        'captured-operation-1',
      ),
    ).rejects.toThrow(/matching, unallocated captured/);
    await expect(
      service.recordCapturedProviderPayment(
        actor,
        settlement.id,
        {
          ...capturedDto,
          allocations: [{ snapshotId: 'line-2', amount: '30.0000' }],
        },
        'captured-operation-1',
      ),
    ).rejects.toThrow(/matching, unallocated captured/);
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(settlement.amountDue.toFixed(4)).toBe('60.0000');

    const complete = await service.recordCapturedProviderPayment(
      actor,
      settlement.id,
      capturedDto,
      'captured-operation-1',
    );
    expect(tx.paymentOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 'shop-1',
          settlementId: settlement.id,
          checkoutPaymentId: null,
          state: 'CAPTURED',
        }),
        data: {
          checkoutPaymentId: 'payment-2',
          reconciliationRequired: false,
          errorCode: null,
          errorMessage: null,
        },
      }),
    );
    expect(tx.paymentOperation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'captured-operation-1',
          shopId: 'shop-1',
          settlementId: settlement.id,
          state: 'CAPTURED',
        }),
      }),
    );
    expect(complete.state).toBe('PAID');
    expect(complete.amountDue).toBe('0.0000');
    expect(complete.paidAmount).toBe('100.0000');
    expect(complete.payments.map((row) => row.method)).toEqual([
      CheckoutPaymentMethod.CASH,
      CheckoutPaymentMethod.MANUAL_CARD,
    ]);
    expect(cash.requireSessionForCashPayment).toHaveBeenCalledTimes(1);
    expect(cash.recordCashSale).toHaveBeenCalledTimes(1);
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(ledgerEntryCreate).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate snapshot allocations in one payment', async () => {
    const settlement: any = {
      id: 'settlement-1',
      guestCheckId: 'check-1',
      state: 'CALCULATED',
      total: d(10),
      amountDue: d(10),
      currency: 'PLN',
      guestCheck: {
        id: 'check-1',
        status: 'OPEN',
        version: 1,
        currentSettlementId: 'settlement-1',
        shopOrders: [],
        playSessions: [],
        reservations: [],
      },
      snapshots: [
        {
          id: 'line-1',
          position: 0,
          sourceType: 'SHOP_ORDER',
          sourceId: 'order-1',
          lineReference: 'line-1',
          description: 'Item',
          quantity: 1,
          finalAmount: d(10),
          currency: 'PLN',
          allocations: [],
        },
      ],
      payments: [],
    };
    const tx: any = {
      $queryRaw: jest.fn(),
      checkSettlement: { findFirst: jest.fn().mockResolvedValue(settlement) },
    };
    const cash: any = {
      requireSessionForCashPayment: jest.fn().mockResolvedValue('session-1'),
      recordCashSale: jest.fn(),
    };
    const service = new CheckoutPaymentService(
      { $transaction: (fn: any) => fn(tx) } as any,
      { isFeatureEnabled: async () => true } as any,
      new PaymentAllocationService(),
      new SettlementStateService(),
      { enqueue: jest.fn() } as any,
      { record: jest.fn() } as any,
      cash,
    );
    const actor = {
      sub: 'owner-1',
      shopId: 'shop-1',
      shopRole: 'OWNER',
      perms: '*',
    } as JwtAccessPayload;

    await expect(
      service.createPayment(actor, settlement.id, {
        expectedCheckVersion: 1,
        method: CheckoutPaymentMethod.CASH,
        allocationKind: PaymentAllocationKind.CUSTOM,
        allocations: [
          { snapshotId: 'line-1', amount: '4.0000' },
          { snapshotId: 'line-1', amount: '6.0000' },
        ],
      }),
    ).rejects.toThrow(/Duplicate allocation/i);
    expect(cash.recordCashSale).not.toHaveBeenCalled();
  });

  it.each([
    { shopRole: 'CASHIER', perms: '', shopId: 'shop-1' },
    { shopRole: 'STAFF', perms: 'checkout.read', shopId: 'shop-1' },
    { shopRole: 'OWNER', perms: '*', shopId: null },
  ])('denies unauthorized payment writes before database changes (%j)', async (principal) => {
    const prisma: any = { $transaction: jest.fn() };
    const flags: any = { isFeatureEnabled: jest.fn() };
    const service = new CheckoutPaymentService(
      prisma, flags,
      new PaymentAllocationService(), new SettlementStateService(),
      { enqueue: jest.fn() } as any, { record: jest.fn() } as any,
      { recordCashSale: jest.fn() } as any,
    );
    const actor = {
      sub: 'unauthorized-user', shopRole: principal.shopRole,
      shopId: principal.shopId, perms: principal.perms,
    } as JwtAccessPayload;
    await expect(service.createPayment(actor, 'settlement-1', {
      expectedCheckVersion: 1,
      method: CheckoutPaymentMethod.OTHER,
      allocationKind: PaymentAllocationKind.REMAINING,
      allocations: [{ snapshotId: 'line-1', amount: '10.0000' }],
    })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(flags.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it('does not expose a foreign venue settlement from either payment read surface', async () => {
    const prisma: any = {
      checkSettlement: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CheckoutPaymentService(
      prisma,
      { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any,
      new PaymentAllocationService(),
      new SettlementStateService(),
      { enqueue: jest.fn() } as any,
      { record: jest.fn() } as any,
      {} as any,
    );
    const foreignActor = {
      sub: 'owner-other', shopId: 'shop-b', shopRole: 'OWNER', perms: '*',
    } as JwtAccessPayload;
    await expect(service.getPaymentState(foreignActor, 'shop-a-settlement'))
      .rejects.toThrow('Settlement not found');
    await expect(service.previewGroups(foreignActor, 'shop-a-settlement', {
      mode: PaymentAllocationKind.REMAINING,
    })).rejects.toThrow('Settlement not found');
    expect(prisma.checkSettlement.findFirst).toHaveBeenCalledTimes(2);
    for (const call of prisma.checkSettlement.findFirst.mock.calls) {
      expect(call[0].where).toEqual({ id: 'shop-a-settlement', shopId: 'shop-b' });
    }
  });

  it('does not post payment allocations to foreign venue settlements', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      checkSettlement: { findFirst: jest.fn().mockResolvedValue(null) },
      payment: { create: jest.fn() },
      guestCheck: { updateMany: jest.fn() },
    };
    const service = new CheckoutPaymentService(
      { $transaction: (fn: any) => fn(tx) } as any,
      { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any,
      new PaymentAllocationService(),
      new SettlementStateService(),
      { enqueue: jest.fn() } as any,
      { record: jest.fn() } as any,
      {} as any,
    );
    const foreignActor = {
      sub: 'owner-other', shopId: 'shop-b', shopRole: 'OWNER', perms: '*',
    } as JwtAccessPayload;
    await expect(service.createPayment(foreignActor, 'shop-a-settlement', {
      expectedCheckVersion: 1,
      method: CheckoutPaymentMethod.OTHER,
      allocationKind: PaymentAllocationKind.REMAINING,
      allocations: [{ snapshotId: 'foreign-line', amount: '10.0000' }],
    })).rejects.toThrow('Settlement not found');
    expect(tx.checkSettlement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'shop-a-settlement', shopId: 'shop-b' } }),
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.guestCheck.updateMany).not.toHaveBeenCalled();
  });

});
