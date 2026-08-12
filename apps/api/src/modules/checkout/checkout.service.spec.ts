import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CheckoutService } from './checkout.service';

const actor = {
  sub: 'user-1',
  email: 'owner@example.com',
  shopId: 'shop-a',
  shopRole: 'OWNER',
  perms: '*',
} as any;

const createdAt = new Date('2026-08-12T08:00:00.000Z');

function checkoutCheck(overrides: Record<string, unknown> = {}) {
  return {
    id: 'check-1',
    shopId: 'shop-a',
    status: 'OPEN',
    version: 3,
    currentSettlementId: null,
    shop: { currency: 'PLN' },
    shopOrders: [],
    playSessions: [],
    reservations: [],
    ...overrides,
  } as any;
}

function settlementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settlement-1',
    shopId: 'shop-a',
    guestCheckId: 'check-1',
    state: 'CALCULATED',
    checkVersion: 4,
    sourceHash: 'hash-1',
    subtotal: new Prisma.Decimal('25'),
    adjustments: new Prisma.Decimal('0'),
    taxAmount: new Prisma.Decimal('0'),
    depositAmount: new Prisma.Decimal('0'),
    total: new Prisma.Decimal('25'),
    amountDue: new Prisma.Decimal('25'),
    currency: 'PLN',
    createdById: 'user-1',
    createdAt,
    updatedAt: createdAt,
    snapshots: [
      {
        id: 'snapshot-order',
        shopId: 'shop-a',
        settlementId: 'settlement-1',
        position: 0,
        sourceType: 'SHOP_ORDER',
        sourceId: 'order-1',
        lineReference: 'line-1',
        description: 'Drink',
        quantity: 1,
        unitAmount: new Prisma.Decimal('25'),
        grossAmount: new Prisma.Decimal('25'),
        discountAmount: new Prisma.Decimal('0'),
        finalAmount: new Prisma.Decimal('25'),
        currency: 'PLN',
        pricingMetadata: {},
        createdAt,
      },
    ],
    payments: [],
    ...overrides,
  } as any;
}

function buildService(check = checkoutCheck()) {
  const hydrated = settlementRow();
  const tx = {
    guestCheck: {
      findFirst: jest.fn().mockResolvedValue(check),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkSettlement: {
      create: jest.fn().mockResolvedValue({ ...hydrated, snapshots: undefined }),
      findFirst: jest.fn().mockResolvedValue(hydrated),
      update: jest.fn().mockResolvedValue(hydrated),
    },
    chargeSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reservation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    playSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)),
    guestCheck: { findFirst: jest.fn().mockResolvedValue(check) },
    checkSettlement: { findFirst: jest.fn().mockResolvedValue(hydrated) },
  } as any;

  const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
  const calculator = {
    calculate: jest.fn().mockReturnValue({
      checkId: 'check-1',
      checkVersion: check.version,
      sourceHash: 'hash-1',
      currency: 'PLN',
      subtotal: new Prisma.Decimal('25'),
      adjustments: new Prisma.Decimal('0'),
      taxAmount: new Prisma.Decimal('0'),
      depositAmount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('25'),
      amountDue: new Prisma.Decimal('25'),
      lines: [
        {
          position: 0,
          sourceType: 'SHOP_ORDER',
          sourceId: 'order-1',
          lineReference: 'line-1',
          description: 'Drink',
          quantity: 1,
          unitAmount: new Prisma.Decimal('25'),
          grossAmount: new Prisma.Decimal('25'),
          discountAmount: new Prisma.Decimal('0'),
          finalAmount: new Prisma.Decimal('25'),
          currency: 'PLN',
          pricingMetadata: {},
        },
      ],
    }),
    serialize: jest.fn((value) => value),
  } as any;
  const states = {
    assertGuestCheckCanCalculate: jest.fn(),
    initialCalculatedState: jest.fn().mockReturnValue('CALCULATED'),
    assertTransition: jest.fn(),
  } as any;
  const outbox = { enqueue: jest.fn().mockResolvedValue({ id: 'event-1' }) } as any;
  const audit = { record: jest.fn().mockResolvedValue({}) } as any;

  return {
    service: new CheckoutService(
      prisma,
      flags,
      calculator,
      states,
      outbox,
      audit,
    ),
    prisma,
    tx,
    calculator,
    states,
    outbox,
    audit,
  };
}

describe('CheckoutService integrity', () => {
  beforeEach(() => {
    delete process.env.LEDGER_DUAL_WRITE;
  });

  it('previews from the authoritative calculator without writing payment state', async () => {
    const ctx = buildService();
    const result = await ctx.service.preview(actor, 'check-1', {
      expectedVersion: 3,
    });

    expect(result.sourceHash).toBe('hash-1');
    expect(ctx.calculator.calculate).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an immutable settlement only after the bill is final', async () => {
    const ctx = buildService();
    const result = await ctx.service.createSettlement(actor, 'check-1', {
      expectedVersion: 3,
    });

    expect(result.id).toBe('settlement-1');
    expect(ctx.tx.checkSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceHash: 'hash-1' }),
      }),
    );
    expect(ctx.tx.guestCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentSettlementId: 'settlement-1',
        }),
      }),
    );
  });

  it('blocks settlement creation while an order can still change the final bill', async () => {
    const check = checkoutCheck({
      shopOrders: [{ id: 'order-1', status: 'PENDING', label: 'Table 4' }],
    });
    const ctx = buildService(check);

    await expect(
      ctx.service.createSettlement(actor, 'check-1', { expectedVersion: 3 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(ctx.tx.checkSettlement.create).not.toHaveBeenCalled();
  });

  it('blocks settlement creation while a standalone play timer is still running', async () => {
    const check = checkoutCheck({
      playSessions: [
        {
          id: 'play-1',
          status: 'ACTIVE',
          reservationId: null,
          label: 'Pool 2',
          endedAt: null,
        },
      ],
    });
    const ctx = buildService(check);

    await expect(
      ctx.service.createSettlement(actor, 'check-1', { expectedVersion: 3 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(ctx.tx.checkSettlement.create).not.toHaveBeenCalled();
  });

  it('allows an ended standalone play timer to be snapshotted before its paid completion stamp', async () => {
    const check = checkoutCheck({
      playSessions: [
        {
          id: 'play-1',
          status: 'ACTIVE',
          reservationId: null,
          label: 'Pool 2',
          endedAt: new Date('2026-08-12T09:00:00.000Z'),
        },
      ],
    });
    const ctx = buildService(check);

    await expect(
      ctx.service.createSettlement(actor, 'check-1', { expectedVersion: 3 }),
    ).resolves.toMatchObject({ id: 'settlement-1' });
  });

  it('closes a fully paid check and settlement atomically', async () => {
    const check = checkoutCheck({
      currentSettlementId: 'settlement-1',
    });
    const ctx = buildService(check);
    const paid = settlementRow({
      state: 'PAID',
      amountDue: new Prisma.Decimal('0'),
      payments: [{ method: 'MANUAL_CARD' }],
      snapshots: [],
    });
    ctx.tx.checkSettlement.findFirst.mockResolvedValue(paid);

    const result = await ctx.service.closeCheck(actor, 'check-1');

    expect(result).toMatchObject({
      checkId: 'check-1',
      settlementId: 'settlement-1',
      status: 'SETTLED',
      settlementState: 'CLOSED',
    });
    expect(ctx.tx.checkSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'CLOSED' }),
      }),
    );
    expect(ctx.tx.guestCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SETTLED',
          paymentMethod: 'CARD',
        }),
      }),
    );
  });

  it('refuses to close a paid check while live operational work is still open', async () => {
    const check = checkoutCheck({
      currentSettlementId: 'settlement-1',
      shopOrders: [{ id: 'order-1', status: 'PREPARING', label: 'Kitchen 3' }],
    });
    const ctx = buildService(check);
    ctx.tx.checkSettlement.findFirst.mockResolvedValue(
      settlementRow({
        state: 'PAID',
        amountDue: new Prisma.Decimal('0'),
        payments: [{ method: 'CASH' }],
      }),
    );

    await expect(ctx.service.closeCheck(actor, 'check-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ctx.tx.guestCheck.updateMany).not.toHaveBeenCalled();
  });

  it('reconciles paid reservation and ended standalone play without charging twice', async () => {
    const check = checkoutCheck({
      currentSettlementId: 'settlement-1',
      reservations: [
        {
          id: 'reservation-1',
          status: 'CONFIRMED',
          guestName: 'Alex',
          resourceId: 'table-1',
          billedAmount: null,
        },
      ],
      playSessions: [
        {
          id: 'play-1',
          status: 'ACTIVE',
          label: 'Pool 2',
          reservationId: null,
          endedAt: new Date('2026-08-12T09:00:00.000Z'),
          completedAt: null,
        },
      ],
    });
    const ctx = buildService(check);
    ctx.tx.checkSettlement.findFirst.mockResolvedValue(
      settlementRow({
        state: 'PAID',
        amountDue: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('60'),
        payments: [{ method: 'CASH' }],
        snapshots: [
          {
            sourceType: 'RESERVATION',
            sourceId: 'reservation-1',
            finalAmount: new Prisma.Decimal('20'),
          },
          {
            sourceType: 'PLAY_SESSION',
            sourceId: 'play-1',
            finalAmount: new Prisma.Decimal('40'),
          },
        ],
      }),
    );
    ctx.tx.guestCheck.findFirst
      .mockResolvedValueOnce(check)
      .mockResolvedValueOnce({
        ...check,
        reservations: [{ ...check.reservations[0], billedAmount: new Prisma.Decimal('20') }],
        playSessions: [{ ...check.playSessions[0], status: 'COMPLETED', completedAt: new Date() }],
      });

    const result = await ctx.service.closeCheck(actor, 'check-1');

    expect(result.reconciledReservations).toBe(1);
    expect(result.reconciledPlaySessions).toBe(1);
    expect(ctx.tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ billedAmount: new Prisma.Decimal('20') }),
      }),
    );
    expect(ctx.tx.playSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Prisma.Decimal('40'),
          status: 'COMPLETED',
        }),
      }),
    );
    expect(ctx.outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'settlement.closed' }),
    );
  });
});