import { ReservationRemindersService } from './reservation-reminders.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AuditService } from '../audit/audit.service';

describe('reservation reminders use authoritative venue time', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.TZ = 'America/Los_Angeles';
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  function harness(rows: unknown[], timeZone = 'Europe/Warsaw') {
    const query = jest
      .fn()
      .mockResolvedValue([{ locale: 'pl', timezone: timeZone }]);
    const findMany = jest.fn().mockResolvedValue(rows);
    const record = jest.fn().mockResolvedValue(undefined);
    const prisma = { $queryRaw: query, reservation: { findMany } };
    const notifications = { recordReservationEvent: record };
    const service = new ReservationRemindersService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AuditService,
    );
    return { service, query, record };
  }

  it('uses tomorrow in Warsaw across UTC midnight, independently of host timezone', async () => {
    jest.setSystemTime(new Date('2027-06-01T23:25:00Z'));
    const h = harness([
      {
        id: 'reservation-a',
        shopId: 'shop-a',
        guestName: 'A',
        startsAt: new Date('2027-06-01T23:30:00Z'),
        resource: { name: 'Unit', type: 'BILLIARD' },
      },
    ]);
    const run = h.service as unknown as { upcomingIn5Min: () => Promise<void> };
    await run.upcomingIn5Min();
    expect(h.record).toHaveBeenCalledWith(
      'shop-a',
      expect.objectContaining({
        href: '/sessions?tab=schedule&date=2027-06-02',
      }),
    );
    const first = h.record.mock.calls[0] as [string, { body: string }];
    expect(first[1].body).toMatch(/01:30.*GMT\+2.*Europe\/Warsaw/);
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('distinguishes the repeated autumn DST hour with an explicit offset', () => {
    const h = harness([]);
    const format = h.service as unknown as {
      fmtTime: (at: Date, timeZone: string) => string;
    };
    expect(
      format.fmtTime(new Date('2026-10-25T00:30:00Z'), 'Europe/Warsaw'),
    ).toMatch(/02:30.*GMT\+2/);
    expect(
      format.fmtTime(new Date('2026-10-25T01:30:00Z'), 'Europe/Warsaw'),
    ).toMatch(/02:30.*GMT\+1/);
  });

  it('scopes and reuses timezone lookup for two same-shop reminders', async () => {
    jest.setSystemTime(new Date('2027-06-01T23:30:00Z'));
    const rows = ['a', 'b'].map((id) => ({
      id,
      shopId: 'shop-a',
      guestName: id,
      startsAt: new Date('2027-06-01T23:30:00Z'),
      resource: { name: 'Unit', type: 'BILLIARD' },
    }));
    const h = harness(rows);
    const run = h.service as unknown as { startsNow: () => Promise<void> };
    await run.startsNow();
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(2);
    expect(h.record).toHaveBeenNthCalledWith(
      1,
      'shop-a',
      expect.objectContaining({
        href: '/sessions?tab=schedule&date=2027-06-02',
      }),
    );
    expect(h.record).toHaveBeenNthCalledWith(
      2,
      'shop-a',
      expect.objectContaining({
        href: '/sessions?tab=schedule&date=2027-06-02',
      }),
    );
  });
});
