import { BadRequestException } from '@nestjs/common';
import { assertWithinOpeningHours } from './opening-hours.util';

function mockPrisma(opts: {
  timezone?: string;
  locale?: string;
  exception?: { isClosed: boolean; opensAt?: string; closesAt?: string } | null;
  regular?: { isClosed: boolean; opensAt: string; closesAt: string } | null;
}) {
  const timezone = opts.timezone ?? 'UTC';
  const locale = opts.locale ?? 'en';
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ locale, timezone }]),
    scheduleException: {
      findFirst: jest.fn().mockResolvedValue(opts.exception ?? null),
    },
    openingHour: {
      findUnique: jest.fn().mockResolvedValue(opts.regular ?? null),
    },
  };
}

describe('assertWithinOpeningHours', () => {
  it('rejects closed day (regular hours)', async () => {
    const prisma = mockPrisma({
      timezone: 'Europe/Warsaw',
      regular: { isClosed: true, opensAt: '10:00', closesAt: '22:00' },
    });
    // Monday 2026-07-20 12:00 Warsaw = 10:00 UTC
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T10:00:00.000Z'),
        new Date('2026-07-20T11:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      response: { message: 'The venue is closed on this date.' },
    });
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T10:00:00.000Z'),
        new Date('2026-07-20T11:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects closed day (schedule exception)', async () => {
    const prisma = mockPrisma({
      timezone: 'UTC',
      exception: { isClosed: true },
      regular: { isClosed: false, opensAt: '09:00', closesAt: '21:00' },
    });
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T12:00:00.000Z'),
        new Date('2026-07-20T13:00:00.000Z'),
      ),
    ).rejects.toThrow(/closed on this date/i);
  });

  it('rejects outside opening window', async () => {
    const prisma = mockPrisma({
      timezone: 'Europe/Warsaw',
      regular: { isClosed: false, opensAt: '10:00', closesAt: '18:00' },
    });
    // 19:00–20:00 Warsaw = 17:00–18:00 UTC in July (CEST)
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T17:00:00.000Z'),
        new Date('2026-07-20T18:00:00.000Z'),
      ),
    ).rejects.toThrow(/within opening hours \(10:00–18:00\)/);
  });

  it('allows booking fully inside hours in Shop.timezone', async () => {
    const prisma = mockPrisma({
      timezone: 'Europe/Warsaw',
      regular: { isClosed: false, opensAt: '10:00', closesAt: '22:00' },
    });
    // 12:00–14:00 Warsaw = 10:00–12:00 UTC
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T10:00:00.000Z'),
        new Date('2026-07-20T12:00:00.000Z'),
      ),
    ).resolves.toBeUndefined();
  });

  it('uses exception hours when present', async () => {
    const prisma = mockPrisma({
      timezone: 'UTC',
      exception: { isClosed: false, opensAt: '12:00', closesAt: '14:00' },
      regular: { isClosed: false, opensAt: '09:00', closesAt: '21:00' },
    });
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T12:30:00.000Z'),
        new Date('2026-07-20T13:30:00.000Z'),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T11:00:00.000Z'),
        new Date('2026-07-20T12:30:00.000Z'),
      ),
    ).rejects.toThrow(/within opening hours/);
  });

  it('rejects multi-day windows in venue timezone', async () => {
    const prisma = mockPrisma({
      timezone: 'America/New_York',
      regular: { isClosed: false, opensAt: '00:00', closesAt: '23:59' },
    });
    // Same UTC day but crosses local midnight in NY
    await expect(
      assertWithinOpeningHours(
        prisma as never,
        'shop_1',
        new Date('2026-07-20T03:00:00.000Z'), // 23:00 prev day NY
        new Date('2026-07-20T05:00:00.000Z'), // 01:00 NY
      ),
    ).rejects.toThrow(/same day/);
  });
});
