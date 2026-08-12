import { Prisma } from '@prisma/client';
import { CheckoutService } from './checkout.service';

const actor = {
  sub: 'user-1',
  email: 'owner@example.com',
  shopId: 'shop-a',
  shopRole: 'OWNER',
  perms: '*',
} as any;

const createdAt = new Date('2026-08-09T20:00:00.000Z');

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
        id: 'snapshot-1',
        shopId: 'shop-a',
        settlementId: 'settlement-1',
        position: 0,
        sourceType: 'SHOP_ORDER',
        sourceId: 'order-1',
        lineReference: 'line-1',
        description: 'Original drink name',
        quantity: 1,
        unitAmount: new Prisma.Decimal('25'),
        grossAmount: new Prisma.Decimal('25'),
        discountAmount: new Prisma.Decimal('0'),
        finalAmount: new Prisma.Decimal('25'),
        currency: 'PLN',
        pricingMetadata: { original: true },
        createdAt,
      },
    ],
    ...overrides,
  } as any;
}

function buildService(options: { checkVersion?: number; flag?: boolean } = {}) {
  const checkVersion = options.checkVersion ?? 3;
  const check = {
    id: 'check-1',
    shopId: 'shop-a',
    status: 'OPEN',
    version: checkVersion,
    currency: 'PLN',
    shop: { currency: 'PLN' },
    shopOrders: [],
    playSessions: [],
    reservations: [],
  };
  const hydrated = settlementRow({ checkVersion: checkVersion + 1 });

  const tx = {
    guestCheck: {
      findFirst: jest.fn().mockResolvedValue(check),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkSettlement: {
      create: jest.fn().mockResolvedValue({
        ...hydrated,
        snapshots: undefined,
      }),
      findFirst: jest.fn().mockResolvedValue(hydrated),
    },
    chargeSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    domainEventOutbox: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)),
    guestCheck: { findFirst: jest.fn().mockResolvedValue(check) },
    checkSettlement: { findFirst: jest.fn().mockResolvedValue(hydrated) },
  } as any;

  const flags = {
    isFeatureEnabled: jest.fn().mockResolvedValue(options.flag ?? true),
  } as any;
  const calculator = {
    calculate: jest.fn().mockReturnValue({
      checkId: 'check-1',
      checkVersion,
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
          description: 'Original drink name',
          quantity: 1,
          unitAmount: new Prisma.Decimal('25'),
          grossAmount: new Prisma.Decimal('25'),
          discountAmount: new Prisma.Decimal('0'),
          finalAmount: new Prisma.Decimal('25'),
          currency: 'PLN',
          pricingMetadata: { original: true },
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
  const outbox = {
    enqueue: jest.fn().mockResolvedValue({ id: 'event-1' }),
  } as any;
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
    flags,
    calculator,
    states,
    outbox,
    audit,
  };
}

function buildCloseService(options: {
  settlementState?: 'CALCULATED' | 'PARTIALLY_PAID' | 'PAID' | 'CLOSED' | 'VOID';
  total?: string;
  amountDue?: string;
  orderStatus?: string;
  playStatus?: string;
  reservationLinkedPlay?: boolean;
} = {}) {
  const check = {
    id: 'check-1',
    shopId: 'shop-a',
    status: 'OPEN',
    version: 8,
    currentSettlementId: 'settlement-1',
    shopOrders:
      options.orderStatus == null
        ? []
        : [
            {
              id: 'order-12345678',
              status: options.orderStatus,
              label: 'Table 4 order',
            },
          ],
    playSessions:
      options.playStatus == null
        ? []
        : [
            {
              id: 'play-12345678',
              status: options.playStatus,
              label: 'Pool table 2',
              reservationId: options.reservationLinkedPlay
                ? 'reservation-1'
                : null,
            },
          ],
  };

  const settlement = {
    id: 'settlement-1',
    shopId: 'shop-a',
    guestCheckId: 'check-1',
    state: options.settlementState ?? 'PAID',
    total: new Prisma.Decimal(options.total ?? '100'),
    amountDue: new Prisma.Decimal(options.amountDue ?? '0'),
    currency: 'PLN',
  } as any;

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'check-1' }]),
    guestCheck: {
      findFirst: jest.fn().mockResolvedValue(check),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkSettlement: {
      findFirst: jest.fn().mockResolvedValue(settlement),
      update: jest.fn().mockResolvedValue({ ...settlement, state: 'CLOSED' }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)),
  } as any;
  const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
  const calculator = {} as any;
  const states = {
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
    tx,
    states,
    outbox,
    audit,
  };
}

describe('CheckoutService', () => {
  it('creates settlement, immutable snapshots and domain event in one transaction without charging money', async () => {
    const ctx = buildService();

    const result = await ctx.service.createSettlement(
      actor,
      'check-1',
      { expectedVersion: 3 },
      'corr_12345678',
    );

    expect(ctx.tx.checkSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guestCheckId: 'check-1',
          state: 'CALCULATED',
          checkVersion: 4,
          total: expect.any(Prisma.Decimal),
        }),
      }),
    );
    expect(ctx.tx.chargeSnapshot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          settlementId: 'settlement-1',
          description: 'Original drink name',
          finalAmount: expect.any(Prisma.Decimal),
        }),
      ],
    });
    expect(ctx.tx.guestCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 3, shopId: 'shop-a' }),
        data: {
          currentSettlementId: 'settlement-1',
          version: { increment: 1 },
        },
      }),
    );
    expect(ctx.outbox.enqueue).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({
        shopId: 'shop-a',
        eventType: 'settlement.created',
      }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        action: 'checkout.settlement.create',
        meta: expect.objectContaining({ charged: false }),
      }),
    );
    expect(result).toMatchObject({
      id: 'settlement-1',
      total: '25.0000',
      snapshots: [
        expect.objectContaining({
          description: 'Original drink name',
          finalAmount: '25.0000',
        }),
      ],
    });
    expect((ctx.tx as any).transaction).toBeUndefined();
    expect((ctx.tx as any).ledgerEntry).toBeUndefined();
    expect((ctx.tx as any).payment).toBeUndefined();
  });

  it('rejects a stale GuestCheck version before any settlement row is created', async () => {
    const ctx = buildService({ checkVersion: 5 });

    await expect(
      ctx.service.createSettlement(actor, 'check-1', { expectedVersion: 4 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(ctx.tx.checkSettlement.create).not.toHaveBeenCalled();
    expect(ctx.tx.chargeSnapshot.createMany).not.toHaveBeenCalled();
  });

  it('loads settlements with the actor Shop in the query', async () => {
    const ctx = buildService();
    await ctx.service.getSettlement(actor, 'settlement-1');
    expect(ctx.prisma.checkSettlement.findFirst).toHaveBeenCalledWith({
      where: { id: 'settlement-1', shopId: 'shop-a' },
      include: { snapshots: { orderBy: { position: 'asc' } } },
    });
  });

  it('keeps checkout behavior inaccessible when checkout_v2 is off', async () => {
    const ctx = buildService({ flag: false });
    await expect(ctx.service.preview(actor, 'check-1')).rejects.toThrow(
      'Checkout V2 is not enabled',
    );
    expect(ctx.prisma.guestCheck.findFirst).not.toHaveBeenCalled();
  });

  it('closes a fully paid settlement and guest check in the same transaction', async () => {
    const ctx = buildCloseService();

    await expect(ctx.service.closeCheck(actor, 'check-1')).resolves.toMatchObject({
      checkId: 'check-1',
      settlementId: 'settlement-1',
      status: 'SETTLED',
      settlementState: 'CLOSED',
      total: '100.0000',
      currency: 'PLN',
    });

    expect(ctx.states.assertTransition).toHaveBeenCalledWith('PAID', 'CLOSED');
    expect(ctx.tx.checkSettlement.update).toHaveBeenCalledWith({
      where: { id: 'settlement-1' },
      data: { state: 'CLOSED', amountDue: expect.any(Prisma.Decimal) },
    });
    expect(ctx.tx.guestCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'check-1', shopId: 'shop-a', status: 'OPEN' },
        data: expect.objectContaining({
          status: 'SETTLED',
          currentSettlementId: null,
          version: { increment: 1 },
        }),
      }),
    );
    expect(ctx.outbox.enqueue).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({ eventType: 'settlement.closed' }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'checkout.close' }),
    );
  });

  it('refuses to close while payment is still outstanding', async () => {
    const ctx = buildCloseService({
      settlementState: 'PARTIALLY_PAID',
      amountDue: '20',
    });

    await expect(ctx.service.closeCheck(actor, 'check-1')).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Payment is not complete yet' }),
    });
    expect(ctx.tx.checkSettlement.update).not.toHaveBeenCalled();
    expect(ctx.tx.guestCheck.updateMany).not.toHaveBeenCalled();
  });

  it('returns a structured blocker for an open order', async () => {
    const ctx = buildCloseService({ orderStatus: 'OPEN' });

    await expect(ctx.service.closeCheck(actor, 'check-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Finish the live activity before closing this guest check',
        blockers: [
          expect.objectContaining({
            type: 'ORDER',
            id: 'order-12345678',
            action: 'orders',
          }),
        ],
      }),
    });
    expect(ctx.tx.guestCheck.updateMany).not.toHaveBeenCalled();
  });

  it('blocks an active play session even when it came from a reservation', async () => {
    const ctx = buildCloseService({
      playStatus: 'ACTIVE',
      reservationLinkedPlay: true,
    });

    await expect(ctx.service.closeCheck(actor, 'check-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        blockers: [
          expect.objectContaining({
            type: 'PLAY_SESSION',
            id: 'play-12345678',
            action: 'sessions',
          }),
        ],
      }),
    });
    expect(ctx.tx.guestCheck.updateMany).not.toHaveBeenCalled();
  });

  it('allows a zero-value calculated checkout to close without inventing a payment', async () => {
    const ctx = buildCloseService({
      settlementState: 'CALCULATED',
      total: '0',
      amountDue: '0',
    });

    await expect(ctx.service.closeCheck(actor, 'check-1')).resolves.toMatchObject({
      settlementState: 'CLOSED',
      total: '0.0000',
    });
    expect(ctx.states.assertTransition).toHaveBeenNthCalledWith(
      1,
      'CALCULATED',
      'PAID',
    );
    expect(ctx.states.assertTransition).toHaveBeenNthCalledWith(2, 'PAID', 'CLOSED');
  });
});
