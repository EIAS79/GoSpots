import type { JwtAccessPayload } from '../auth/auth.service';
import { ReservationsStaffService } from './reservations-staff.service';
import { ReservationsPublicService } from './reservations-public.service';

jest.mock('../../common/subscription-feature.util', () => ({
  assertShopFeature: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../common/opening-hours.util', () => ({
  assertWithinOpeningHours: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../common/booking-overlap.util', () => ({
  assertBookingSlotFree: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../common/booking-lock.util', () => ({
  withResourceBookingLock: jest.fn(async (db, _resourceId, callback) => callback(db)),
}));
jest.mock('../../common/gdpr-consent.util', () => ({
  assertPrivacyConsentAccepted: jest.fn(),
  recordConsent: jest.fn().mockResolvedValue(undefined),
}));

const startsAt = '2027-06-01T23:30:00.000Z';
const endsAt = '2027-06-02T00:30:00.000Z';
const actor = {
  sub: 'owner-a', shopId: 'shop-a', shopRole: 'OWNER', perms: '*',
} as JwtAccessPayload;

function harness() {
  const resource = {
    id: 'pool-a',
    shopId: 'shop-a',
    name: 'Pool A',
    type: 'BILLIARD',
    capacity: 4,
    category: { name: 'Billiards', offeringConfig: null },
  };
  const reservation = {
    id: 'res-a',
    shopId: 'shop-a',
    guestName: 'Alex',
    guestEmail: 'alex@example.test',
    guestPhone: null,
    partySize: 2,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    resource,
    resourceId: resource.id,
    status: 'CONFIRMED',
    staffAlert: true,
    notes: null,
  };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ locale: 'pl', timezone: 'Europe/Warsaw' }]),
    shop: { findFirst: jest.fn().mockResolvedValue({
      id: 'shop-a', slug: 'warsaw-shop', name: 'GoSpots Warsaw', isPublished: true,
    }) },
    resource: { findFirst: jest.fn().mockResolvedValue(resource) },
    reservation: { create: jest.fn().mockResolvedValue(reservation) },
  };
  const audit: any = {
    record: jest.fn().mockResolvedValue(undefined),
    recordForShop: jest.fn().mockResolvedValue(undefined),
  };
  const notifications: any = {
    recordReservationEvent: jest.fn().mockResolvedValue(undefined),
  };
  const mail: any = {
    send: jest.fn().mockResolvedValue({ sent: true }),
  };
  const config: any = { get: jest.fn().mockReturnValue('http://localhost:3000') };
  return { prisma, audit, notifications, mail, config, resource, reservation };
}

describe('reservation notification venue timezone integration', () => {
  it('uses the shop timezone for a staff-created booking alert and calendar link', async () => {
    const h = harness();
    const service = new ReservationsStaffService(
      h.prisma, h.audit, h.notifications, h.mail, h.config,
    );
    // A staff-created booking without a resource follows the no-lock write path.
    await service.create(actor, {
      guestName: 'Alex',
      startsAt,
      endsAt,
      staffAlert: true,
    });
    expect(h.notifications.recordReservationEvent).toHaveBeenCalledWith('shop-a',
      expect.objectContaining({
        body: expect.stringContaining('Jun 2'),
        href: '/sessions?tab=schedule&date=2027-06-02',
      }),
    );
    expect(h.audit.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      summary: expect.stringContaining('Europe/Warsaw'),
    }));
  });

  it('uses the shop timezone for public booking staff alerts and guest emails', async () => {
    const h = harness();
    const service = new ReservationsPublicService(
      h.prisma, h.audit, h.notifications, h.mail, h.config,
    );
    const response = await service.createPublicGamingBooking('warsaw-shop', {
      resourceId: h.resource.id,
      guestName: 'Alex',
      guestEmail: 'alex@example.test',
      partySize: 2,
      startsAt,
      endsAt,
      privacyConsentAccepted: true,
    }, 'gaming');
    expect(response.ok).toBe(true);
    expect(h.notifications.recordReservationEvent).toHaveBeenCalledWith('shop-a',
      expect.objectContaining({
        body: expect.stringContaining('Jun 2'),
        href: '/sessions?tab=schedule&date=2027-06-02',
      }),
    );
    const sent = h.mail.send.mock.calls[0]?.[0];
    expect(sent.to).toBe('alex@example.test');
    expect(sent.text).toContain('June 2, 2027');
    expect(sent.text).toContain('Europe/Warsaw');
  });
});
