import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventRequestsService } from './event-requests.service';

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('EventRequestsService.createFromPublic', () => {
  const shop = { id: 'shop-1', name: 'Arena', slug: 'arena' };
  const baseDto = {
    eventType: 'PARTY' as const,
    guestName: 'Alex Guest',
    guestEmail: 'alex@example.com',
    partySize: 8,
    preferredStartsAt: '2030-06-15T14:00:00.000Z',
    preferredEndsAt: '2030-06-15T16:00:00.000Z',
    privacyConsentAccepted: true,
  };

  function makeService(prisma: Record<string, unknown>) {
    return new EventRequestsService(
      prisma as never,
      { recordForShop: jest.fn() } as never,
      { recordReservationEvent: jest.fn() } as never,
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
      consentRecord: { create: jest.fn().mockResolvedValue({ id: 'consent-1' }) },
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
      svc.createFromPublic('missing', baseDto as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when privacy consent is not accepted', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createFromPublic('arena', {
        ...baseDto,
        privacyConsentAccepted: false,
      } as never),
    ).rejects.toThrow(/privacy notice/i);
  });

  it('rejects when neither email nor phone is provided', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createFromPublic('arena', {
        ...baseDto,
        guestEmail: '  ',
        guestPhone: undefined,
      } as never),
    ).rejects.toThrow(/email or phone/i);
  });

  it('rejects party size above 100', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createFromPublic('arena', {
        ...baseDto,
        partySize: 101,
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects end time before or equal to start', async () => {
    const svc = makeService({
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
    });
    await expect(
      svc.createFromPublic('arena', {
        ...baseDto,
        preferredStartsAt: '2030-06-15T16:00:00.000Z',
        preferredEndsAt: '2030-06-15T14:00:00.000Z',
      } as never),
    ).rejects.toThrow(/End time must be after start time/);
  });

  it('rejects requests outside opening hours', async () => {
    const hours = openHoursPrisma({ opensAt: '10:00', closesAt: '12:00' });
    const svc = makeService(hours);
    await expect(
      svc.createFromPublic('arena', baseDto as never),
    ).rejects.toThrow(/opening hours|closed/i);
  });

  it('rejects resource category that does not belong to resolved shop', async () => {
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      resourceCategory: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.createFromPublic('arena', {
        ...baseDto,
        resourceCategoryId: 'foreign-cat',
      } as never),
    ).rejects.toThrow(/not available/i);
  });

  it('persists shopId from slug, never from a client-supplied field', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'er-1',
      eventType: 'PARTY',
      guestName: 'Alex Guest',
      partySize: 8,
      source: 'CLIENT_WEB',
    });
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      eventRequest: { create },
    });

    await svc.createFromPublic('arena', {
      ...baseDto,
      shopId: 'attacker-shop',
    } as never);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: 'shop-1' }),
      }),
    );
    expect(create.mock.calls[0][0].data.shopId).not.toBe('attacker-shop');
  });

  it('persists guest token hash (not plaintext) on create', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'er-2',
      eventType: 'PARTY',
      guestName: 'Alex Guest',
      partySize: 8,
      source: 'CLIENT_WEB',
    });
    const hours = openHoursPrisma();
    const svc = makeService({
      ...hours,
      eventRequest: { create },
    });

    const result = await svc.createFromPublic('arena', baseDto as never);

    expect(result.guestToken).toEqual(expect.any(String));
    expect(result.guestToken.length).toBeGreaterThan(16);
    const data = create.mock.calls[0][0].data;
    expect(data.guestToken).toBeNull();
    expect(data.guestTokenHash).toEqual(expect.any(String));
    expect(data.guestTokenExpiresAt).toBeInstanceOf(Date);
    expect(data.guestTokenHash).not.toBe(result.guestToken);
  });
});
