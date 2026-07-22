import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GuestCheckService } from './guest-check.service';

describe('GuestCheckService', () => {
  const shopId = 'shop_a';
  const otherShopId = 'shop_b';
  const actor = {
    sub: 'owner_1',
    shopId,
    shopRole: 'OWNER',
  } as never;

  const emptyChildren = {
    shopOrders: [] as unknown[],
    playSessions: [] as unknown[],
    reservations: [] as unknown[],
  };

  function baseCheck(overrides: Record<string, unknown> = {}) {
    return {
      id: 'gc_1',
      shopId,
      status: 'OPEN',
      guestName: 'Ada',
      guestEmail: null,
      guestPhone: null,
      partySize: 2,
      label: 'Table 4',
      note: null,
      currency: 'EUR',
      paymentMethod: null,
      openedAt: new Date('2026-07-21T10:00:00Z'),
      settledAt: null,
      voidedAt: null,
      createdById: 'owner_1',
      createdAt: new Date('2026-07-21T10:00:00Z'),
      updatedAt: new Date('2026-07-21T10:00:00Z'),
      ...emptyChildren,
      ...overrides,
    };
  }

  function makeAudit() {
    return { record: jest.fn().mockResolvedValue({ id: 'audit_1' }) };
  }

  function makePrisma(overrides: Record<string, unknown> = {}) {
    const check = baseCheck();
    return {
      shop: {
        findFirst: jest.fn().mockResolvedValue({ currency: 'EUR' }),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue(check),
        findMany: jest.fn().mockResolvedValue([check]),
        create: jest.fn().mockResolvedValue(check),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shopOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord_1',
          guestCheckId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      playSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'play_1',
          guestCheckId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reservation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'res_1',
          guestCheckId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          shopOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          playSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          reservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          guestCheck: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirst: jest.fn().mockResolvedValue(
              baseCheck({ status: 'VOID', voidedAt: new Date() }),
            ),
          },
        };
        return fn(tx);
      }),
      ...overrides,
    };
  }

  it('create opens a shop-scoped check stamped with shop currency', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new GuestCheckService(prisma as never, audit as never);
    const out = await svc.create(actor, { guestName: 'Ada', label: 'Table 4' });
    expect(prisma.guestCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId,
          currency: 'EUR',
          guestName: 'Ada',
        }),
      }),
    );
    expect(out.runningTotal).toBe('0.0000');
    expect(audit.record).toHaveBeenCalled();
  });

  it('attach menu + play + reservation and surfaces no-double-count total', async () => {
    const withKids = baseCheck({
      shopOrders: [
        {
          id: 'ord_1',
          status: 'PENDING',
          total: new Prisma.Decimal('15.0000'),
          label: 'Food',
          reservationFee: new Prisma.Decimal('5.0000'),
          guestCount: 2,
          createdAt: new Date(),
          completedAt: null,
        },
      ],
      playSessions: [
        {
          id: 'play_1',
          status: 'ACTIVE',
          amount: new Prisma.Decimal('99.0000'),
          reservationId: 'res_1',
          label: 'Linked play',
          startedAt: new Date(),
          completedAt: null,
        },
      ],
      reservations: [
        {
          id: 'res_1',
          guestName: 'Ada',
          billedAmount: new Prisma.Decimal('30.0000'),
          billedAt: new Date(),
          resourceId: 'unit_1',
          startsAt: new Date(),
          endsAt: new Date(),
          status: 'CONFIRMED',
        },
      ],
    });
    const prisma = makePrisma({
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue(withKids),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const svc = new GuestCheckService(prisma as never, makeAudit() as never);

    await svc.attach(actor, 'gc_1', {
      shopOrderId: 'ord_1',
      playSessionId: 'play_1',
      reservationId: 'res_1',
    });

    expect(prisma.shopOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord_1', shopId },
      data: { guestCheckId: 'gc_1' },
    });
    expect(prisma.playSession.updateMany).toHaveBeenCalled();
    expect(prisma.reservation.updateMany).toHaveBeenCalled();

    const detail = await svc.get(actor, 'gc_1');
    // 15 order (fee embedded) + 30 reservation billed; linked play 99 excluded
    expect(detail.runningTotal).toBe('45.0000');
    expect(detail.playTotal).toBe('0.0000');
    expect(
      detail.totalLines.some(
        (l) => l.sourceId === 'play_1' && l.excluded === true,
      ),
    ).toBe(true);
  });

  it('rejects attach when child belongs to another check', async () => {
    const prisma = makePrisma({
      shopOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord_1',
          guestCheckId: 'gc_other',
        }),
        updateMany: jest.fn(),
      },
    });
    const svc = new GuestCheckService(prisma as never, makeAudit() as never);
    await expect(
      svc.attach(actor, 'gc_1', { shopOrderId: 'ord_1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects cross-tenant get', async () => {
    const prisma = makePrisma({
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    });
    const svc = new GuestCheckService(prisma as never, makeAudit() as never);
    await expect(svc.get(actor, 'gc_other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.guestCheck.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gc_other', shopId },
      }),
    );
  });

  it('attach uses shopId when loading order (tenant guard)', async () => {
    const prisma = makePrisma();
    const svc = new GuestCheckService(prisma as never, makeAudit() as never);
    await svc.attach(actor, 'gc_1', { shopOrderId: 'ord_1' });
    expect(prisma.shopOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'ord_1', shopId },
      select: { id: true, guestCheckId: true },
    });
    // Cross-shop actor would still scope by their shopId
    const otherActor = { ...actor, shopId: otherShopId } as never;
    prisma.guestCheck.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      svc.attach(otherActor, 'gc_1', { shopOrderId: 'ord_1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('staff without transaction.write cannot create', async () => {
    const prisma = makePrisma();
    const svc = new GuestCheckService(prisma as never, makeAudit() as never);
    const staff = {
      sub: 'staff_1',
      shopId,
      shopRole: 'STAFF',
      perms: 'transaction.read',
    } as never;
    await expect(svc.create(staff, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
