import { ConflictException } from '@nestjs/common';
import {
  isReservationExclusionViolation,
  rethrowIfReservationExclusion,
  withResourceBookingLock,
} from './booking-lock.util';
import {
  assertNoReservationOverlap,
  assertNoWalkInOverlap,
  assertBookingSlotFree,
  assertResourceBookable,
} from './booking-overlap.util';

describe('booking lock + overlap helpers', () => {
  it('isReservationExclusionViolation detects 23P01 / constraint name', () => {
    expect(
      isReservationExclusionViolation({ code: '23P01' }),
    ).toBe(true);
    expect(
      isReservationExclusionViolation({
        message: 'conflict on Reservation_resource_tstzrange_excl',
      }),
    ).toBe(true);
    expect(isReservationExclusionViolation({ code: 'P2002' })).toBe(false);
  });

  it('rethrowIfReservationExclusion maps to ConflictException', () => {
    expect(() =>
      rethrowIfReservationExclusion({ code: '23P01' }),
    ).toThrow(ConflictException);
    expect(() => rethrowIfReservationExclusion(new Error('other'))).toThrow(
      'other',
    );
  });

  it('withResourceBookingLock maps exclusion violation to 409', async () => {
    const prisma = {
      $transaction: jest.fn(async () => {
        throw { code: '23P01', message: 'Reservation_resource_tstzrange_excl' };
      }),
    };
    await expect(
      withResourceBookingLock(prisma as never, 'res_1', async () => 'ok'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('withResourceBookingLock runs FOR UPDATE then callback', async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async () => {
        order.push('lock');
        return [{ id: 'res_1' }];
      }),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        order.push('txn');
        return fn(tx);
      }),
    };

    const result = await withResourceBookingLock(
      prisma as never,
      'res_1',
      async () => {
        order.push('work');
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    expect(order).toEqual(['txn', 'lock', 'work']);
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('update-style walk-in path: lock then assert (exclude self) then update', async () => {
    const order: string[] = [];
    const startsAt = new Date('2030-01-01T10:00:00Z');
    const endsAt = new Date('2030-01-01T12:00:00Z');
    const tx = {
      $queryRaw: jest.fn(async () => {
        order.push('lock');
        return [{ id: 'res_1' }];
      }),
      resource: {
        findFirst: jest.fn(async () => {
          order.push('bookable');
          return { id: 'res_1', shopId: 'shop', status: 'AVAILABLE' };
        }),
      },
      playSession: {
        findMany: jest.fn(async () => {
          order.push('walkin');
          return [];
        }),
        update: jest.fn(async () => {
          order.push('update');
          return { id: 'sess_1' };
        }),
      },
      reservation: {
        findFirst: jest.fn(async () => {
          order.push('reservation');
          return null;
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        order.push('txn');
        return fn(tx);
      }),
    };

    const result = await withResourceBookingLock(
      prisma as never,
      'res_1',
      async (lockedTx) => {
        await assertResourceBookable(lockedTx, 'shop', 'res_1');
        await assertNoWalkInOverlap(
          lockedTx,
          'shop',
          'res_1',
          startsAt,
          endsAt,
          'sess_1',
        );
        await assertNoReservationOverlap(
          lockedTx,
          'shop',
          'res_1',
          startsAt,
          endsAt,
        );
        return lockedTx.playSession.update({
          where: { id: 'sess_1' },
          data: { durationMinutes: 120 },
        });
      },
    );

    expect(result).toEqual({ id: 'sess_1' });
    expect(order).toEqual([
      'txn',
      'lock',
      'bookable',
      'walkin',
      'reservation',
      'update',
    ]);
    expect(tx.playSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'sess_1' } }),
      }),
    );
  });

  it('assertNoReservationOverlap throws on clash', async () => {
    const prisma = {
      reservation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'clash' }),
      },
    };
    await expect(
      assertNoReservationOverlap(
        prisma as never,
        'shop',
        'res',
        new Date('2030-01-01T10:00:00Z'),
        new Date('2030-01-01T11:00:00Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('assertBookingSlotFree checks resource then overlaps', async () => {
    const prisma = {
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'res',
          shopId: 'shop',
          status: 'AVAILABLE',
        }),
      },
      reservation: { findFirst: jest.fn().mockResolvedValue(null) },
      playSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(
      assertBookingSlotFree(
        prisma as never,
        'shop',
        'res',
        new Date('2030-01-01T10:00:00Z'),
        new Date('2030-01-01T11:00:00Z'),
      ),
    ).resolves.toBeUndefined();
  });

  it('assertNoWalkInOverlap excludes self session id', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { playSession: { findMany } };
    await assertNoWalkInOverlap(
      prisma as never,
      'shop',
      'res',
      new Date('2030-01-01T10:00:00Z'),
      new Date('2030-01-01T11:00:00Z'),
      'self_ps',
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'self_ps' },
        }),
      }),
    );
  });
});
