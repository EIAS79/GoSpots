import { ForbiddenException } from '@nestjs/common';
import { ReservationStatus, ResourceStatus } from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { ReservationsPublicService } from './reservations-public.service';
import { ReservationsScheduleService } from './reservations-schedule.service';
import { ReservationsStaffService } from './reservations-staff.service';

/**
 * Bible §14 Phase 3 PREP: characterization tests for ReservationsService staff
 * CRUD happy paths not fully locked in `reservations.characterization.spec.ts`
 * (field update, delete success, create audit/guestToken wire). Locks wire
 * before staff CRUD extraction. Zero product-behavior changes intended.
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

import { assertBookingSlotFree } from '../../common/booking-overlap.util';
import { withResourceBookingLock } from '../../common/booking-lock.util';
import {
  holdEndsAt,
  parseNoShowMinutes,
} from '../../common/dining-reservation.util';

describe('ReservationsService staff CRUD characterization (Phase 3 prep)', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const notifications = { recordReservationEvent: jest.fn() };
  const mail = { send: jest.fn().mockResolvedValue({ sent: false }) };
  const config = { get: () => undefined };

  const writer = {
    sub: 'user_1',
    shopId: 'shop_1',
    perms: 'reservation.write',
  } as const;

  const reader = {
    sub: 'user_reader',
    shopId: 'shop_1',
    perms: 'reservation.read',
  } as const;

  const denied = {
    sub: 'user_2',
    shopId: 'shop_1',
    perms: '',
  } as const;

  const shop = { id: 'shop_1', name: 'Arena', slug: 'arena' };

  const baseStaffDto = {
    guestName: 'Staff Guest',
    resourceId: 'res-1',
    partySize: 2,
    startsAt: '2026-12-15T14:00:00.000Z',
    endsAt: '2026-12-15T15:00:00.000Z',
  };

  const diningResource = {
    id: 'res-1',
    shopId: shop.id,
    type: 'DINING',
    capacity: 8,
    name: 'T1',
    category: { name: 'Dining', offeringConfig: null },
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

  beforeEach(() => {
    jest.clearAllMocks();
    (assertBookingSlotFree as jest.Mock).mockResolvedValue(undefined);
  });

  describe('list (staff)', () => {
    it('returns reservations wrapper from shop-scoped findMany', async () => {
      const rows = [
        {
          id: 'rv-1',
          shopId: shop.id,
          resourceId: 'res-1',
          guestName: 'Alex Guest',
          startsAt: new Date('2026-12-15T14:00:00.000Z'),
          endsAt: new Date('2026-12-15T15:00:00.000Z'),
          status: ReservationStatus.CONFIRMED,
          resource: diningResource,
        },
      ];
      const findMany = jest.fn().mockResolvedValue(rows);
      const svc = makeService({ reservation: { findMany } });

      const out = await svc.list(reader as never, {} as never);

      expect(out).toEqual({ reservations: rows });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: 'shop_1' },
        }),
      );
    });
  });

  describe('create (staff)', () => {
    it('records reservation.create audit after successful create', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'rv-new',
        shopId: shop.id,
        resourceId: 'res-1',
        guestName: 'Staff Guest',
        guestEmail: null,
        guestPhone: null,
        partySize: 2,
        startsAt: new Date(baseStaffDto.startsAt),
        endsAt: new Date(baseStaffDto.endsAt),
        status: ReservationStatus.CONFIRMED,
        staffAlert: false,
        notes: null,
        resource: diningResource,
      });
      const svc = makeService({
        resource: {
          findFirst: jest.fn().mockResolvedValue(diningResource),
        },
        reservation: { create },
      });

      await svc.create(writer as never, baseStaffDto as never);

      expect(audit.record).toHaveBeenCalledWith(
        writer,
        expect.objectContaining({
          section: 'reservation',
          action: 'reservation.create',
          meta: expect.objectContaining({
            reservationId: 'rv-new',
            resourceId: 'res-1',
          }),
        }),
      );
    });

    it('returns raw guestToken once when guestEmail is provided', async () => {
      const create = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'rv-guest',
          shopId: shop.id,
          resourceId: 'res-1',
          guestName: 'Staff Guest',
          guestEmail: 'guest@example.com',
          guestPhone: null,
          partySize: 2,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          status: ReservationStatus.CONFIRMED,
          staffAlert: false,
          notes: null,
          guestToken: null,
          guestTokenHash: data.guestTokenHash,
          guestTokenExpiresAt: data.guestTokenExpiresAt,
          guestTokenRevokedAt: null,
          resource: diningResource,
        }),
      );
      const svc = makeService({
        resource: {
          findFirst: jest.fn().mockResolvedValue(diningResource),
        },
        reservation: { create },
      });

      const row = await svc.create(writer as never, {
        ...baseStaffDto,
        guestEmail: 'guest@example.com',
      } as never);

      expect(row.guestToken).toEqual(expect.any(String));
      expect(row.guestTokenHash).toBeTruthy();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestEmail: 'guest@example.com',
            guestTokenHash: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('update (staff)', () => {
    const existing = {
      id: 'rv-1',
      shopId: shop.id,
      resourceId: 'res-1',
      guestName: 'Alex Guest',
      guestEmail: null,
      guestPhone: null,
      partySize: 2,
      startsAt: new Date('2026-12-15T14:00:00.000Z'),
      endsAt: new Date('2026-12-15T15:00:00.000Z'),
      status: ReservationStatus.CONFIRMED,
      staffAlert: false,
      notes: null,
      guestToken: null,
      guestTokenHash: null,
      guestTokenExpiresAt: null,
      guestTokenRevokedAt: null,
    };

    it('patches guest fields under resource lock with reservation.update audit', async () => {
      const updated = {
        ...existing,
        guestName: 'Renamed Guest',
        partySize: 4,
        resource: diningResource,
      };
      const findFirstReservation = jest.fn().mockResolvedValue(existing);
      const findFirstResource = jest.fn().mockResolvedValue(diningResource);
      const update = jest.fn().mockResolvedValue(updated);
      const svc = makeService({
        reservation: { findFirst: findFirstReservation, update },
        resource: { findFirst: findFirstResource },
      });

      const row = await svc.update(writer as never, 'rv-1', {
        guestName: 'Renamed Guest',
        partySize: 4,
      } as never);

      expect(withResourceBookingLock).toHaveBeenCalledWith(
        expect.anything(),
        'res-1',
        expect.any(Function),
      );
      expect(assertBookingSlotFree).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        'res-1',
        existing.startsAt,
        holdEndsAt(
          existing.startsAt,
          parseNoShowMinutes(diningResource.category.offeringConfig),
        ),
        'rv-1',
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rv-1', shopId: 'shop_1' },
          data: expect.objectContaining({
            guestName: 'Renamed Guest',
            partySize: 4,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        writer,
        expect.objectContaining({
          action: 'reservation.update',
          meta: expect.objectContaining({
            previousStatus: ReservationStatus.CONFIRMED,
          }),
        }),
      );
      expect(row.guestName).toBe('Renamed Guest');
    });

    it('CHECKED_IN marks resource BUSY and records check-in notification', async () => {
      const updated = {
        ...existing,
        status: ReservationStatus.CHECKED_IN,
        resource: diningResource,
      };
      const findFirstReservation = jest.fn().mockResolvedValue(existing);
      const findFirstResource = jest.fn().mockResolvedValue(diningResource);
      const update = jest.fn().mockResolvedValue(updated);
      const resourceUpdate = jest.fn().mockResolvedValue({});
      const svc = makeService({
        reservation: { findFirst: findFirstReservation, update },
        resource: { findFirst: findFirstResource, update: resourceUpdate },
      });

      await svc.update(writer as never, 'rv-1', {
        status: ReservationStatus.CHECKED_IN,
      } as never);

      expect(resourceUpdate).toHaveBeenCalledWith({
        where: { id: 'res-1', shopId: 'shop_1' },
        data: { status: ResourceStatus.BUSY },
      });
      expect(notifications.recordReservationEvent).toHaveBeenCalledWith(
        'shop_1',
        expect.objectContaining({
          dedupeKey: 'checkin:rv-1',
        }),
      );
    });

    it('denies missing reservation.write', async () => {
      const svc = makeService({});
      await expect(
        svc.update(denied as never, 'rv-1', {
          guestName: 'Blocked',
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('delete (staff)', () => {
    const existing = {
      id: 'rv-1',
      shopId: shop.id,
      resourceId: 'res-1',
      guestName: 'Alex Guest',
      guestEmail: null,
      guestPhone: null,
      partySize: 2,
      startsAt: new Date('2026-12-15T14:00:00.000Z'),
      endsAt: new Date('2026-12-15T15:00:00.000Z'),
      status: ReservationStatus.CONFIRMED,
      staffAlert: false,
      notes: null,
      guestToken: null,
      guestTokenHash: null,
      resource: diningResource,
    };

    it('deletes by shopId scope and records reservation.delete audit', async () => {
      const findFirst = jest.fn().mockResolvedValue(existing);
      const del = jest.fn().mockResolvedValue(existing);
      const svc = makeService({
        reservation: { findFirst, delete: del },
      });

      await svc.delete(writer as never, 'rv-1');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rv-1', shopId: 'shop_1' },
        }),
      );
      expect(del).toHaveBeenCalledWith({
        where: { id: 'rv-1', shopId: 'shop_1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        writer,
        expect.objectContaining({
          action: 'reservation.delete',
          meta: expect.objectContaining({
            reservationId: 'rv-1',
            guestName: 'Alex Guest',
          }),
        }),
      );
    });

    it('denies missing reservation.write', async () => {
      const svc = makeService({});
      await expect(
        svc.delete(denied as never, 'rv-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
