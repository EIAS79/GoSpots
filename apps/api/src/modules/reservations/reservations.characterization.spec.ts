import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus, ResourceStatus } from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { ReservationsPublicService } from './reservations-public.service';
import { ReservationsScheduleService } from './reservations-schedule.service';
import { ReservationsStaffService } from './reservations-staff.service';
import {
  guestTokenPersistFields,
  issueGuestToken,
} from '../../common/guest-token.util';

/**
 * Bible §14 / legacy #11 Phase 3 PREP: characterization tests for
 * ReservationsService tenant scoping, overlap enforcement, public guest
 * cancel, and staff status transitions. Locks current behavior BEFORE any
 * potential extraction. Zero product-behavior changes intended.
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

describe('ReservationsService characterization (Phase 3 prep)', () => {
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

  describe('list', () => {
    it('scopes findMany by actor shopId and applies query filters', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const svc = makeService({ reservation: { findMany } });

      await svc.list(reader as never, {
        resourceId: 'res-1',
        categoryId: 'cat-1',
        from: '2026-12-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
      } as never);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop_1',
            resourceId: 'res-1',
            resource: { categoryId: 'cat-1' },
            startsAt: {
              gte: new Date('2026-12-01T00:00:00.000Z'),
              lte: new Date('2026-12-31T23:59:59.000Z'),
            },
          }),
          orderBy: { startsAt: 'asc' },
          take: 500,
        }),
      );
    });
  });

  describe('create (staff)', () => {
    it('denies create when assertBookingSlotFree reports an overlap conflict', async () => {
      (assertBookingSlotFree as jest.Mock).mockRejectedValue(
        new ConflictException(
          'This unit already has a booking that overlaps that time.',
        ),
      );
      const svc = makeService({
        resource: {
          findFirst: jest.fn().mockResolvedValue(diningResource),
        },
      });

      await expect(
        svc.create(writer as never, baseStaffDto as never),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(withResourceBookingLock).toHaveBeenCalledWith(
        expect.anything(),
        'res-1',
        expect.any(Function),
      );
      expect(assertBookingSlotFree).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        'res-1',
        new Date(baseStaffDto.startsAt),
        holdEndsAt(
          new Date(baseStaffDto.startsAt),
          parseNoShowMinutes(diningResource.category.offeringConfig),
        ),
      );
    });

    it('creates under resource lock with shopId from actor, not client body', async () => {
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

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopId: 'shop_1',
            resourceId: 'res-1',
            guestName: 'Staff Guest',
            status: ReservationStatus.CONFIRMED,
          }),
        }),
      );
      expect(assertBookingSlotFree).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        'res-1',
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('denies missing reservation.write', async () => {
      const svc = makeService({});
      await expect(
        svc.create(denied as never, baseStaffDto as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update (staff cancel / status)', () => {
    const existing = {
      id: 'rv-1',
      shopId: shop.id,
      resourceId: 'res-1',
      guestName: 'Alex Guest',
      guestEmail: 'alex@example.com',
      guestPhone: null,
      partySize: 2,
      startsAt: new Date('2026-12-15T14:00:00.000Z'),
      endsAt: new Date('2026-12-15T15:00:00.000Z'),
      status: ReservationStatus.CONFIRMED,
      staffAlert: false,
      notes: null,
      guestToken: null,
      guestTokenHash: 'hash-1',
      guestTokenExpiresAt: new Date('2027-01-15T00:00:00.000Z'),
      guestTokenRevokedAt: null,
    };

    it('transitions CONFIRMED → CANCELED with shopId-scoped update and cancel audit', async () => {
      const updated = {
        ...existing,
        status: ReservationStatus.CANCELED,
        endsAt: new Date('2026-07-22T12:00:00.000Z'),
        resource: diningResource,
      };
      const findFirstReservation = jest.fn().mockResolvedValue(existing);
      const update = jest.fn().mockResolvedValue(updated);
      const resourceUpdate = jest.fn().mockResolvedValue({});
      const svc = makeService({
        reservation: { findFirst: findFirstReservation, update },
        resource: {
          findFirst: jest.fn().mockResolvedValue(diningResource),
          update: resourceUpdate,
        },
        shop: {
          findUnique: jest.fn().mockResolvedValue({ name: shop.name, slug: shop.slug }),
        },
      });

      const row = await svc.update(writer as never, 'rv-1', {
        status: ReservationStatus.CANCELED,
      } as never);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rv-1', shopId: 'shop_1' },
          data: expect.objectContaining({
            status: ReservationStatus.CANCELED,
            guestTokenRevokedAt: expect.any(Date),
            guestToken: null,
          }),
        }),
      );
      expect(resourceUpdate).toHaveBeenCalledWith({
        where: { id: 'res-1', shopId: 'shop_1' },
        data: { status: ResourceStatus.AVAILABLE },
      });
      expect(audit.record).toHaveBeenCalledWith(
        writer,
        expect.objectContaining({
          section: 'reservation',
          action: 'reservation.cancel',
        }),
      );
      expect(row.status).toBe(ReservationStatus.CANCELED);
    });

    it('denies missing reservation.write', async () => {
      const svc = makeService({});
      await expect(
        svc.update(denied as never, 'rv-1', {
          status: ReservationStatus.CANCELED,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createPublicGamingBooking', () => {
    const publicDto = {
      resourceId: 'res-1',
      guestName: 'Alex Guest',
      guestEmail: 'alex@example.com',
      partySize: 2,
      startsAt: '2026-12-15T14:00:00.000Z',
      endsAt: '2026-12-15T15:00:00.000Z',
      privacyConsentAccepted: true,
    };

    function publicPrisma() {
      return {
        shop: { findFirst: jest.fn().mockResolvedValue(shop) },
        resource: {
          findFirst: jest.fn().mockResolvedValue(diningResource),
        },
      };
    }

    it('denies public create when overlap check fails under resource lock', async () => {
      (assertBookingSlotFree as jest.Mock).mockRejectedValue(
        new ConflictException(
          'This unit already has a booking that overlaps that time.',
        ),
      );
      const svc = makeService(publicPrisma());

      await expect(
        svc.createPublicGamingBooking('arena', publicDto as never, 'dining'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(assertBookingSlotFree).toHaveBeenCalledWith(
        expect.anything(),
        'shop_1',
        'res-1',
        new Date(publicDto.startsAt),
        holdEndsAt(
          new Date(publicDto.startsAt),
          parseNoShowMinutes(diningResource.category.offeringConfig),
        ),
      );
    });
  });

  describe('cancelPublicGamingBooking', () => {
    it('cancels guest booking scoped to slug shop, revokes token, frees resource', async () => {
      const issued = issueGuestToken({
        from: new Date('2026-12-15T15:00:00.000Z'),
      });
      const row = {
        id: 'rv-guest',
        shopId: shop.id,
        resourceId: 'res-1',
        guestName: 'Alex Guest',
        guestEmail: 'alex@example.com',
        partySize: 2,
        startsAt: new Date('2026-12-15T14:00:00.000Z'),
        endsAt: new Date('2026-12-15T15:00:00.000Z'),
        status: ReservationStatus.CONFIRMED,
        notes: null,
        ...guestTokenPersistFields(issued),
        resource: diningResource,
      };
      const updated = {
        ...row,
        status: ReservationStatus.CANCELED,
        endsAt: new Date('2026-07-22T12:00:00.000Z'),
        guestTokenRevokedAt: new Date('2026-07-22T12:00:00.000Z'),
        guestToken: null,
      };
      const findFirstShop = jest.fn().mockResolvedValue(shop);
      const findFirstReservation = jest.fn().mockResolvedValue(row);
      const updateReservation = jest.fn().mockResolvedValue(updated);
      const updateResource = jest.fn().mockResolvedValue({});
      const svc = makeService({
        shop: { findFirst: findFirstShop },
        reservation: {
          findFirst: findFirstReservation,
          update: updateReservation,
        },
        resource: { update: updateResource },
      });

      const out = await svc.cancelPublicGamingBooking(
        'arena',
        issued.raw,
        'dining',
      );

      expect(findFirstReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ shopId: 'shop_1' }),
        }),
      );
      expect(updateReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rv-guest', shopId: 'shop_1' },
          data: expect.objectContaining({
            status: ReservationStatus.CANCELED,
            guestTokenRevokedAt: expect.any(Date),
            guestToken: null,
          }),
        }),
      );
      expect(updateResource).toHaveBeenCalledWith({
        where: { id: 'res-1', shopId: 'shop_1' },
        data: { status: ResourceStatus.AVAILABLE },
      });
      expect(audit.recordForShop).toHaveBeenCalledWith(
        'shop_1',
        expect.objectContaining({
          action: 'reservation.cancel_public',
        }),
      );
      expect(out).toEqual(
        expect.objectContaining({ ok: true, message: expect.any(String) }),
      );
    });

    it('rejects cancel when session already ended (COMPLETED)', async () => {
      const issued = issueGuestToken();
      const row = {
        id: 'rv-done',
        shopId: shop.id,
        resourceId: 'res-1',
        guestName: 'Alex Guest',
        guestEmail: 'alex@example.com',
        partySize: 2,
        startsAt: new Date('2026-12-15T14:00:00.000Z'),
        endsAt: new Date('2026-12-15T15:00:00.000Z'),
        status: ReservationStatus.COMPLETED,
        notes: null,
        ...guestTokenPersistFields(issued),
        resource: diningResource,
      };
      const svc = makeService({
        shop: { findFirst: jest.fn().mockResolvedValue(shop) },
        reservation: { findFirst: jest.fn().mockResolvedValue(row) },
      });

      await expect(
        svc.cancelPublicGamingBooking('arena', issued.raw, 'dining'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('delete (staff)', () => {
    it('scopes lookup and delete by actor shopId — cross-tenant id is NotFound', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const svc = makeService({
        reservation: { findFirst, delete: jest.fn() },
      });

      await expect(
        svc.delete(writer as never, 'rv-other-shop'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rv-other-shop', shopId: 'shop_1' },
        }),
      );
    });
  });
});
