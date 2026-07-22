import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus, ResourceStatus } from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { ReservationsPublicService } from './reservations-public.service';
import { ReservationsScheduleService } from './reservations-schedule.service';
import { ReservationsStaffService } from './reservations-staff.service';

/**
 * Bible §14 Phase 3 PREP: characterization tests for ReservationsService
 * schedule paths (`getSchedule`, `getPublicSchedule`, `buildScheduleForShop`).
 * Locks shopId scope + public schedule wire before any extraction.
 */

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

jest.mock('../../common/subscription-feature.util', () => ({
  assertShopFeature: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/opening-hours.util', () => ({
  assertWithinOpeningHours: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/shop-venue-time.util', () => ({
  loadShopVenueTimeContext: jest.fn().mockResolvedValue({
    resolvedTimeZone: 'UTC',
  }),
}));

jest.mock('../../common/gdpr-consent.util', () => ({
  assertPrivacyConsentAccepted: jest.fn(),
  recordConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/ledger-post.util', () => ({
  postReservationBilled: jest.fn(),
}));

jest.mock('../../common/currency-stamp.util', () => ({
  loadShopCurrency: jest.fn().mockResolvedValue('EUR'),
}));

import { assertShopFeature } from '../../common/subscription-feature.util';
import { dayBoundsInTimeZone } from '../../common/venue-timezone.util';

describe('ReservationsService schedule characterization (Phase 3 prep)', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const notifications = { recordReservationEvent: jest.fn() };
  const mail = { send: jest.fn().mockResolvedValue({ sent: false }) };
  const config = { get: () => undefined };

  const reader = {
    sub: 'user_reader',
    shopId: 'shop_1',
    perms: 'reservation.read',
  } as const;

  const shop = { id: 'shop_1', name: 'Arena', slug: 'arena' };
  const scheduleDate = '2026-12-15';

  const diningCategory = {
    id: 'cat-dining',
    name: 'Dining',
    type: 'DINING',
    slotMinutes: 60,
    bookingMode: 'SLOT',
    offeringConfig: null,
    sortOrder: 0,
    resources: [
      {
        id: 'res-1',
        name: 'T1',
        status: ResourceStatus.AVAILABLE,
        capacity: 8,
        sortOrder: 0,
        section: null,
        tableGroup: null,
      },
    ],
    gamingSections: [],
  };

  const diningReservation = {
    id: 'rv-1',
    shopId: shop.id,
    resourceId: 'res-1',
    guestName: 'Alex Guest',
    guestEmail: 'alex@example.com',
    guestPhone: '+48123456789',
    partySize: 2,
    startsAt: new Date('2026-12-15T14:00:00.000Z'),
    endsAt: new Date('2026-12-15T15:00:00.000Z'),
    status: ReservationStatus.CONFIRMED,
    staffAlert: false,
    notes: 'Window seat',
    billedAt: null,
  };

  function makeService(prisma: Record<string, unknown>) {
    const auditDeps = audit as never;
    const notificationsDeps = notifications as never;
    const mailDeps = mail as never;
    const configDeps = config as never;
    const prismaDeps = prisma as never;
    const publicGuest = new ReservationsPublicService(
      prismaDeps,
      auditDeps,
      notificationsDeps,
      mailDeps,
      configDeps,
    );
    const schedule = new ReservationsScheduleService(prismaDeps);
    const staff = new ReservationsStaffService(
      prismaDeps,
      auditDeps,
      notificationsDeps,
      mailDeps,
      configDeps,
    );
    return new ReservationsService(
      prismaDeps,
      auditDeps,
      notificationsDeps,
      mailDeps,
      configDeps,
      publicGuest,
      schedule,
      staff,
    );
  }

  function schedulePrisma(overrides?: {
    categories?: unknown[];
    reservations?: unknown[];
    playSessions?: unknown[];
  }) {
    const { dayStart, dayEnd } = dayBoundsInTimeZone(scheduleDate, 'UTC');
    const findManyCategories = jest
      .fn()
      .mockResolvedValue(overrides?.categories ?? [diningCategory]);
    const findManyReservations = jest
      .fn()
      .mockResolvedValue(overrides?.reservations ?? [diningReservation]);
    const findManyPlaySessions = jest
      .fn()
      .mockResolvedValue(overrides?.playSessions ?? []);

    return {
      prisma: {
        resourceCategory: { findMany: findManyCategories },
        reservation: { findMany: findManyReservations },
        playSession: { findMany: findManyPlaySessions },
      },
      findManyCategories,
      findManyReservations,
      findManyPlaySessions,
      dayStart,
      dayEnd,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (assertShopFeature as jest.Mock).mockResolvedValue(undefined);
  });

  describe('getSchedule (staff)', () => {
    it('scopes category, reservation, and walk-in queries by actor shopId', async () => {
      const {
        prisma,
        findManyCategories,
        findManyReservations,
        findManyPlaySessions,
        dayStart,
        dayEnd,
      } = schedulePrisma();
      const svc = makeService(prisma);

      await svc.getSchedule(reader as never, { date: scheduleDate });

      expect(assertShopFeature).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        'reservation',
      );
      expect(findManyCategories).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ shopId: 'shop_1' }),
          select: ReservationsScheduleService.SCHEDULE_CATEGORY_SELECT,
        }),
      );
      expect(findManyCategories).not.toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.anything() }),
      );
      expect(findManyReservations).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop_1',
            startsAt: { lte: dayEnd },
            endsAt: { gte: dayStart },
          }),
          take: ReservationsScheduleService.SCHEDULE_DAY_QUERY_TAKE,
        }),
      );
      expect(findManyPlaySessions).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop_1',
            startedAt: { lte: dayEnd },
          }),
          take: ReservationsScheduleService.SCHEDULE_DAY_QUERY_TAKE,
        }),
      );
    });

    it('scopes categoryId lookup to actor shopId', async () => {
      const findFirstCategory = jest.fn().mockResolvedValue({
        id: 'cat-dining',
        type: 'DINING',
      });
      const { prisma } = schedulePrisma();
      const svc = makeService({
        ...prisma,
        resourceCategory: {
          findFirst: findFirstCategory,
          findMany: jest.fn().mockResolvedValue([diningCategory]),
        },
      });

      await svc.getSchedule(reader as never, {
        date: scheduleDate,
        categoryId: 'cat-dining',
      });

      expect(findFirstCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-dining', shopId: 'shop_1' },
        }),
      );
    });
  });

  describe('getPublicSchedule', () => {
    it('resolves published slug and queries schedule under that shopId', async () => {
      const findFirstShop = jest.fn().mockResolvedValue({ id: shop.id });
      const { prisma, findManyCategories } = schedulePrisma();
      const svc = makeService({
        shop: { findFirst: findFirstShop },
        ...prisma,
      });

      const out = await svc.getPublicSchedule('arena', { date: scheduleDate });

      expect(findFirstShop).toHaveBeenCalledWith({
        where: { slug: 'arena', isPublished: true },
        select: { id: true },
      });
      expect(findManyCategories).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ shopId: shop.id }),
        }),
      );
      expect(out.date).toBe(scheduleDate);
      expect(out.summary).toEqual(
        expect.objectContaining({
          totalUnits: 1,
        }),
      );
    });

    it('throws NotFound when slug is missing or unpublished', async () => {
      const svc = makeService({
        shop: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        svc.getPublicSchedule('missing', { date: scheduleDate }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sanitizes guest PII on public wire (names, contact, notes)', async () => {
      const findFirstShop = jest.fn().mockResolvedValue({ id: shop.id });
      const { prisma } = schedulePrisma();
      const svc = makeService({
        shop: { findFirst: findFirstShop },
        ...prisma,
      });

      const out = await svc.getPublicSchedule(
        'arena',
        { date: scheduleDate },
        'dining',
      );

      const booking = out.categories[0]?.units[0]?.bookings[0];
      expect(booking).toEqual(
        expect.objectContaining({
          guestName: 'Reserved',
          guestEmail: null,
          guestPhone: null,
          notes: null,
        }),
      );
      expect(out.agenda[0]).toEqual(
        expect.objectContaining({
          guestName: 'Reserved',
          guestEmail: null,
          guestPhone: null,
          notes: null,
        }),
      );
    });

    it('rejects dining schedule when categoryId is not a dining category', async () => {
      const findFirstShop = jest.fn().mockResolvedValue({ id: shop.id });
      const findFirstCategory = jest.fn().mockResolvedValue({
        id: 'cat-pc',
        type: 'PC',
      });
      const svc = makeService({
        shop: { findFirst: findFirstShop },
        resourceCategory: { findFirst: findFirstCategory },
      });

      await expect(
        svc.getPublicSchedule(
          'arena',
          { date: scheduleDate, categoryId: 'cat-pc' },
          'dining',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('schedule day query caps (§35 Phase 3)', () => {
    it('warns when reservation rows hit the day take cap', async () => {
      const cap = ReservationsScheduleService.SCHEDULE_DAY_QUERY_TAKE;
      const cappedReservations = Array.from({ length: cap }, (_, i) => ({
        ...diningReservation,
        id: `rv-cap-${i}`,
      }));
      const { prisma } = schedulePrisma({
        reservations: cappedReservations,
      });
      const schedule = new ReservationsScheduleService(prisma as never);
      const warnSpy = jest
        .spyOn(schedule['logger'], 'warn')
        .mockImplementation(() => undefined);

      await schedule.getSchedule(reader as never, { date: scheduleDate });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Schedule reservation query hit take cap'),
      );
      warnSpy.mockRestore();
    });

    it('warns when walk-in rows hit the day take cap', async () => {
      const cap = ReservationsScheduleService.SCHEDULE_DAY_QUERY_TAKE;
      const cappedWalkIns = Array.from({ length: cap }, (_, i) => ({
        id: `ps-cap-${i}`,
        shopId: shop.id,
        resourceId: 'res-1',
        status: 'ACTIVE',
        archivedAt: null,
        startedAt: new Date('2026-12-15T12:00:00.000Z'),
        endsAt: null,
        guestName: 'Walk-in',
        partySize: 1,
      }));
      const { prisma } = schedulePrisma({
        reservations: [],
        playSessions: cappedWalkIns,
      });
      const schedule = new ReservationsScheduleService(prisma as never);
      const warnSpy = jest
        .spyOn(schedule['logger'], 'warn')
        .mockImplementation(() => undefined);

      await schedule.getSchedule(reader as never, { date: scheduleDate });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Schedule walk-in query hit take cap'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('schedule date validation', () => {
    it('rejects malformed date keys', async () => {
      const svc = makeService({});

      await expect(
        svc.getSchedule(reader as never, { date: 'not-a-date' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects dates beyond the schedule horizon', async () => {
      const svc = makeService({});

      await expect(
        svc.getSchedule(reader as never, { date: '2000-01-01' }),
      ).rejects.toMatchObject({
        message: 'Schedule date is too far in the past.',
      });
    });
  });
});
