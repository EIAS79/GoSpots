import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

jest.mock('../../common/booking-lock.util', () => ({
  withResourceBookingLock: jest.fn(
    async (
      prisma: unknown,
      _resourceId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(prisma),
  ),
}));

jest.mock('../../common/booking-overlap.util', () => ({
  assertBookingSlotFree: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

/** Parallel-agent entitlements gate — keep unit tests focused on booking validation. */
jest.mock('../../common/subscription-feature.util', () => ({
  assertShopFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('ReservationsService.createPublicGamingBooking', () => {
  const shop = { id: 'shop-1', name: 'Arena', slug: 'arena' };
  // Within schedule/booking horizon (~1 year) from ship-window "today".
  const baseDto = {
    resourceId: 'res-1',
    guestName: 'Alex Guest',
    guestEmail: 'alex@example.com',
    partySize: 2,
    startsAt: '2026-12-15T14:00:00.000Z',
    endsAt: '2026-12-15T15:00:00.000Z',
  };

  function makeService(prisma: Record<string, unknown>) {
    return new ReservationsService(
      prisma as never,
      { recordForShop: jest.fn() } as never,
      { recordReservationEvent: jest.fn() } as never,
      { send: jest.fn().mockResolvedValue({ sent: false }) } as never,
      { get: () => undefined } as never,
    );
  }

  function openHoursPrisma(overrides?: {
    opensAt?: string;
    closesAt?: string;
    isClosed?: boolean;
  }) {
    const opensAt = overrides?.opensAt ?? '00:00';
    const closesAt = overrides?.closesAt ?? '23:59';
    const isClosed = overrides?.isClosed ?? false;
    return {
      $queryRaw: jest.fn().mockResolvedValue([
        { locale: 'en', timezone: 'UTC' },
      ]),
      shop: {
        findFirst: jest.fn().mockResolvedValue(shop),
        findUnique: jest.fn().mockResolvedValue({ locale: 'en' }),
      },
      scheduleException: { findFirst: jest.fn().mockResolvedValue(null) },
      openingHour: {
        findUnique: jest.fn().mockResolvedValue({
          isClosed,
          opensAt,
          closesAt,
        }),
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unknown venue slug', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.createPublicGamingBooking('missing', baseDto as never, 'dining'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects party size above 100', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createPublicGamingBooking(
        'arena',
        { ...baseDto, partySize: 101 } as never,
        'dining',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects party size below 1', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createPublicGamingBooking(
        'arena',
        { ...baseDto, partySize: 0 } as never,
        'dining',
      ),
    ).rejects.toThrow(/Party size must be between 1 and 100/);
  });

  it('rejects end time before or equal to start', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createPublicGamingBooking(
        'arena',
        {
          ...baseDto,
          startsAt: '2026-12-15T15:00:00.000Z',
          endsAt: '2026-12-15T14:00:00.000Z',
        } as never,
        'dining',
      ),
    ).rejects.toThrow(/End time must be after start time/);
  });

  it('rejects resource that does not belong to resolved shop', async () => {
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      resource: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.createPublicGamingBooking('arena', baseDto as never, 'dining'),
    ).rejects.toThrow(/Table or unit not found/);
  });

  it('rejects non-dining resource on dining booking path', async () => {
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'res-1',
          shopId: shop.id,
          type: 'PC',
          capacity: 2,
          name: 'PC-1',
          category: { name: 'PCs', offeringConfig: null },
        }),
      },
    });
    await expect(
      svc.createPublicGamingBooking('arena', baseDto as never, 'dining'),
    ).rejects.toThrow(/not available for dining/);
  });

  it('rejects party above resource capacity', async () => {
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'res-1',
          shopId: shop.id,
          type: 'DINING',
          capacity: 4,
          name: 'T1',
          category: { name: 'Dining', offeringConfig: null },
        }),
      },
    });
    await expect(
      svc.createPublicGamingBooking(
        'arena',
        { ...baseDto, partySize: 6 } as never,
        'dining',
      ),
    ).rejects.toThrow(/seats up to 4/);
  });

  it('rejects bookings outside opening hours', async () => {
    const hours = openHoursPrisma({ opensAt: '10:00', closesAt: '12:00' });
    const svc = makeService({
      ...hours,
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'res-1',
          shopId: shop.id,
          type: 'DINING',
          capacity: 8,
          name: 'T1',
          category: { name: 'Dining', offeringConfig: null },
        }),
      },
    });
    await expect(
      svc.createPublicGamingBooking(
        'arena',
        {
          ...baseDto,
          startsAt: '2026-12-15T14:00:00.000Z',
          endsAt: '2026-12-15T15:00:00.000Z',
        } as never,
        'dining',
      ),
    ).rejects.toThrow(/opening hours|closed/i);
  });

  it('persists shopId from slug, never from a client-supplied field', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'rv-1',
      resourceId: 'res-1',
      guestName: 'Alex Guest',
      guestEmail: 'alex@example.com',
      guestPhone: null,
      startsAt: new Date(baseDto.startsAt),
      endsAt: new Date(baseDto.endsAt),
      status: 'CONFIRMED',
      notes: null,
      resource: {
        name: 'T1',
        type: 'DINING',
        category: { name: 'Dining' },
      },
    });
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'res-1',
          shopId: shop.id,
          type: 'DINING',
          capacity: 8,
          name: 'T1',
          category: { name: 'Dining', offeringConfig: null },
        }),
      },
      reservation: { create },
    });

    await svc.createPublicGamingBooking(
      'arena',
      {
        ...baseDto,
        shopId: 'attacker-shop',
      } as never,
      'dining',
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: 'shop-1' }),
      }),
    );
    expect(create.mock.calls[0][0].data.shopId).not.toBe('attacker-shop');
  });
});

describe('ReservationsService.create (staff)', () => {
  const actor = {
    shopId: 'shop-1',
    perms: 'reservation.write',
    sub: 'user-1',
  } as const;

  function makeService(prisma: Record<string, unknown>) {
    return new ReservationsService(
      prisma as never,
      { recordForShop: jest.fn() } as never,
      { recordReservationEvent: jest.fn() } as never,
      { send: jest.fn().mockResolvedValue({ sent: false }) } as never,
      { get: () => undefined } as never,
    );
  }

  it('rejects party size above 100', async () => {
    const svc = makeService({});
    await expect(
      svc.create(actor as never, {
        guestName: 'Staff Guest',
        partySize: 101,
        startsAt: '2026-12-15T14:00:00.000Z',
        endsAt: '2026-12-15T15:00:00.000Z',
      } as never),
    ).rejects.toThrow(/Party size must be between 1 and 100/);
  });

  it('rejects party size below 1', async () => {
    const svc = makeService({});
    await expect(
      svc.create(actor as never, {
        guestName: 'Staff Guest',
        partySize: 0,
        startsAt: '2026-12-15T14:00:00.000Z',
        endsAt: '2026-12-15T15:00:00.000Z',
      } as never),
    ).rejects.toThrow(/Party size must be between 1 and 100/);
  });
});

describe('ReservationsService.update (staff)', () => {
  const actor = {
    shopId: 'shop-1',
    perms: 'reservation.write',
    sub: 'user-1',
  } as const;

  function makeService(prisma: Record<string, unknown>) {
    return new ReservationsService(
      prisma as never,
      { recordForShop: jest.fn() } as never,
      { recordReservationEvent: jest.fn() } as never,
      { send: jest.fn().mockResolvedValue({ sent: false }) } as never,
      { get: () => undefined } as never,
    );
  }

  it('rejects party size above 100', async () => {
    const svc = makeService({});
    await expect(
      svc.update(actor as never, 'rv-1', { partySize: 101 } as never),
    ).rejects.toThrow(/Party size must be between 1 and 100/);
  });
});
