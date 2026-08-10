import {
  CashMovementType,
  CashSessionStatus,
  Prisma,
  ShiftCloseApprovalStatus,
} from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CashService } from './cash.service';

function d(value: string | number) {
  return new Prisma.Decimal(value);
}

function actor(perms = '*') {
  return {
    sub: 'cashier-1',
    shopId: 'shop-1',
    shopRole: perms === '*' ? 'OWNER' : 'STAFF',
    perms,
  } as JwtAccessPayload;
}

function makeService(prisma: any, flags = { isFeatureEnabled: async () => true }) {
  return new CashService(
    prisma,
    flags as any,
    { enqueue: jest.fn().mockResolvedValue(undefined) } as any,
    { record: jest.fn().mockResolvedValue(undefined) } as any,
  );
}

function openSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    shopId: 'shop-1',
    drawerId: 'drawer-1',
    drawer: {
      id: 'drawer-1',
      shopId: 'shop-1',
      name: 'Main drawer',
      isActive: true,
      createdAt: new Date('2026-08-10T08:00:00Z'),
      updatedAt: new Date('2026-08-10T08:00:00Z'),
    },
    status: CashSessionStatus.OPEN,
    openedById: 'cashier-1',
    openedAt: new Date('2026-08-10T08:00:00Z'),
    openingFloat: d(100),
    currency: 'PLN',
    version: 1,
    closedExpectedCash: null,
    countedCash: null,
    variance: null,
    closedAt: null,
    closedById: null,
    closeNote: null,
    createdAt: new Date('2026-08-10T08:00:00Z'),
    updatedAt: new Date('2026-08-10T08:00:00Z'),
    movements: [],
    counts: [],
    approvals: [],
    ...overrides,
  } as any;
}

describe('CashService Gate 05', () => {
  it('reconciles opening + sales + pay-ins - refunds - pay-outs - safe drops', () => {
    const service = makeService({} as any);
    const expected = (service as any).expectedCash(d(100), [
      { type: CashMovementType.CASH_SALE, amount: d(50) },
      { type: CashMovementType.PAY_IN, amount: d(20) },
      { type: CashMovementType.CASH_REFUND, amount: d(30) },
      { type: CashMovementType.PAY_OUT, amount: d(10) },
      { type: CashMovementType.SAFE_DROP, amount: d(5) },
    ]);
    expect(expected.toFixed(4)).toBe('125.0000');
  });

  it('blocks CASH checkout when the venue requires a session and cashier has none', async () => {
    const tx = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(0),
          currency: 'PLN',
        }),
      },
      cashSession: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = makeService({} as any);

    await expect(
      service.requireSessionForCashPayment(tx, actor(), 'PLN'),
    ).rejects.toThrow(/Open a cash session in My Shift before taking cash/i);
  });

  it('returns the open session for CASH checkout and rejects a currency mismatch', async () => {
    const tx = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(0),
          currency: 'PLN',
        }),
      },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          currency: 'PLN',
        }),
      },
    } as any;
    const service = makeService({} as any);

    await expect(
      service.requireSessionForCashPayment(tx, actor(), 'PLN'),
    ).resolves.toBe('session-1');
    await expect(
      service.requireSessionForCashPayment(tx, actor(), 'EUR'),
    ).rejects.toThrow(/currency does not match/i);
  });

  it('does not require a session when Shop policy disables the requirement', async () => {
    const tx = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: false,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(0),
          currency: 'PLN',
        }),
      },
      cashSession: { findFirst: jest.fn() },
    } as any;
    const service = makeService({} as any);

    await expect(
      service.requireSessionForCashPayment(tx, actor(), 'PLN'),
    ).resolves.toBeNull();
    expect(tx.cashSession.findFirst).not.toHaveBeenCalled();
  });

  it('records an automatic cash sale linked to one checkout payment', async () => {
    const movementCreate = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new CashService(
      {} as any,
      { isFeatureEnabled: async () => true } as any,
      outbox as any,
      { record: jest.fn() } as any,
    );
    const tx = { cashMovement: { create: movementCreate } } as any;

    await service.recordCashSale(tx, {
      shopId: 'shop-1',
      cashSessionId: 'session-1',
      actorId: 'cashier-1',
      paymentId: 'payment-1',
      amount: d(42),
      currency: 'PLN',
    });

    expect(movementCreate).toHaveBeenCalledTimes(1);
    expect(movementCreate.mock.calls[0][0].data).toMatchObject({
      cashSessionId: 'session-1',
      type: CashMovementType.CASH_SALE,
      paymentId: 'payment-1',
      actorId: 'cashier-1',
    });
    expect(movementCreate.mock.calls[0][0].data.amount.toFixed(4)).toBe(
      '42.0000',
    );
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it('rejects manual movement against a closed session', async () => {
    const movementCreate = jest.fn();
    const tx = {
      $queryRaw: jest.fn(),
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(
          openSession({ status: CashSessionStatus.CLOSED }),
        ),
      },
      cashMovement: { create: movementCreate },
    } as any;
    const service = makeService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(
      service.createMovement(actor(), 'session-1', {
        type: CashMovementType.PAY_IN,
        amount: '10.00',
        reasonCategory: 'float-adjustment',
      }),
    ).rejects.toThrow(/Closed cash sessions are immutable/i);
    expect(movementCreate).not.toHaveBeenCalled();
  });

  it('hides expected drawer cash before blind count for a cashier without view permission', async () => {
    const session = openSession({
      movements: [
        {
          id: 'move-1',
          type: CashMovementType.CASH_SALE,
          amount: d(25),
          currency: 'PLN',
          reasonCategory: 'checkout.cash-sale',
          note: null,
          actorId: 'cashier-1',
          paymentId: 'payment-1',
          occurredAt: new Date('2026-08-10T08:30:00Z'),
        },
      ],
    });
    const prisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(5),
          currency: 'PLN',
        }),
      },
      cashSession: { findFirst: jest.fn().mockResolvedValue(session) },
    } as any;
    const service = makeService(prisma);

    const result = await service.getMyShift(
      actor('cash.open,cash.movement,cash.close'),
    );
    expect(result.session?.expectedCash).toBeNull();
    expect(result.session?.expectedHidden).toBe(true);
    expect(result.session?.movementTotals.cashSales).toBe('25.0000');
  });

  it('creates a pending approval when count variance exceeds the Shop threshold', async () => {
    const session = openSession();
    const approvalCreate = jest.fn().mockResolvedValue({
      id: 'approval-1',
      status: ShiftCloseApprovalStatus.PENDING,
    });
    const tx = {
      $queryRaw: jest.fn(),
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(session),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(5),
          currency: 'PLN',
        }),
      },
      cashCount: {
        create: jest.fn().mockResolvedValue({ id: 'count-1' }),
      },
      shiftCloseApproval: { create: approvalCreate },
    } as any;
    const service = makeService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    const result = await service.submitCount(actor(), 'session-1', {
      countedAmount: '110.00',
    });
    expect(result.variance).toBe('10.0000');
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalStatus).toBe(ShiftCloseApprovalStatus.PENDING);
    expect(approvalCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses close above threshold until the latest count is approved', async () => {
    const session = openSession();
    const tx = {
      $queryRaw: jest.fn(),
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        update: jest.fn(),
      },
      cashCount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'count-1',
          countedAmount: d(110),
          expectedCashAtSubmission: d(100),
        }),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(5),
          currency: 'PLN',
        }),
      },
      shiftCloseApproval: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = makeService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(
      service.closeSession(actor(), 'session-1', { cashCountId: 'count-1' }),
    ).rejects.toThrow(/must be approved before close/i);
    expect(tx.cashSession.update).not.toHaveBeenCalled();
  });

  it('rejects a stale count if cash moved after count submission', async () => {
    const session = openSession({
      movements: [
        {
          type: CashMovementType.PAY_IN,
          amount: d(10),
        },
      ],
    });
    const tx = {
      $queryRaw: jest.fn(),
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        update: jest.fn(),
      },
      cashCount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'count-1',
          countedAmount: d(100),
          expectedCashAtSubmission: d(100),
        }),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(100),
          currency: 'PLN',
        }),
      },
    } as any;
    const service = makeService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(
      service.closeSession(actor(), 'session-1', { cashCountId: 'count-1' }),
    ).rejects.toThrow(/Recount before closing/i);
  });
});
