import { listOpeningWindows } from './opening-hours.util';

function prismaFor(timezone: string, opensAt = '00:00', closesAt = '04:00') {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ locale: 'pl', timezone }]),
    scheduleException: { findFirst: jest.fn().mockResolvedValue(null) },
    openingHour: {
      findUnique: jest.fn().mockResolvedValue({
        isClosed: false,
        opensAt,
        closesAt,
      }),
    },
  } as any;
}

describe('venue-local opening windows', () => {
  it('uses the venue IANA timezone across the Europe/Warsaw spring DST gap', async () => {
    const prisma = prismaFor('Europe/Warsaw');
    const from = new Date('2026-03-28T23:00:00.000Z'); // 00:00 local
    const to = new Date('2026-03-29T02:00:00.000Z'); // 04:00 local after spring-forward

    const windows = await listOpeningWindows(prisma, 'shop-1', from, to);

    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual({
      dateKey: '2026-03-29',
      opensAt: from,
      closesAt: to,
    });
    expect((windows[0].closesAt.getTime() - windows[0].opensAt.getTime()) / 3_600_000).toBe(3);
  });

  it('uses the venue IANA timezone across the Europe/Warsaw autumn DST fold', async () => {
    const prisma = prismaFor('Europe/Warsaw');
    const from = new Date('2026-10-24T22:00:00.000Z'); // 00:00 local
    const to = new Date('2026-10-25T03:00:00.000Z'); // 04:00 local after fall-back

    const windows = await listOpeningWindows(prisma, 'shop-1', from, to);

    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual({
      dateKey: '2026-10-25',
      opensAt: from,
      closesAt: to,
    });
    expect((windows[0].closesAt.getTime() - windows[0].opensAt.getTime()) / 3_600_000).toBe(5);
  });

  it('clips venue opening windows to the half-open reporting interval', async () => {
    const prisma = prismaFor('UTC', '09:00', '17:00');
    const from = new Date('2026-08-11T10:30:00.000Z');
    const to = new Date('2026-08-11T15:15:00.000Z');

    const windows = await listOpeningWindows(prisma, 'shop-1', from, to);

    expect(windows).toEqual([
      {
        dateKey: '2026-08-11',
        opensAt: from,
        closesAt: to,
      },
    ]);
  });

  it('treats close <= open as an overnight venue window', async () => {
    const prisma = prismaFor('UTC', '20:00', '02:00');
    const from = new Date('2026-08-11T19:00:00.000Z');
    const to = new Date('2026-08-12T03:00:00.000Z');

    const windows = await listOpeningWindows(prisma, 'shop-1', from, to);

    expect(windows[0]).toEqual({
      dateKey: '2026-08-11',
      opensAt: new Date('2026-08-11T20:00:00.000Z'),
      closesAt: new Date('2026-08-12T02:00:00.000Z'),
    });
  });
});
