import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { loadShopVenueTimeContext } from './shop-venue-time.util';
import {
  calendarDayInTimeZone,
  parseDateKey,
  weekdayInTimeZone,
  zonedWallTimeToUtc,
} from './venue-timezone.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

async function resolveDayHours(
  prisma: DbClient,
  shopId: string,
  dateKey: string,
  weekday: number,
) {
  const exception = await prisma.scheduleException.findFirst({
    where: { shopId, date: dateKey },
  });
  if (exception?.isClosed) {
    return { closed: true as const, opensAt: null, closesAt: null };
  }
  if (exception?.opensAt && exception?.closesAt) {
    return {
      closed: false as const,
      opensAt: exception.opensAt,
      closesAt: exception.closesAt,
    };
  }
  const regular = await prisma.openingHour.findUnique({
    where: { shopId_weekday: { shopId, weekday } },
  });
  if (!regular || regular.isClosed) {
    return { closed: true as const, opensAt: null, closesAt: null };
  }
  return {
    closed: false as const,
    opensAt: regular.opensAt,
    closesAt: regular.closesAt,
  };
}

/**
 * Booking/session window must fit inside venue opening hours for the start date.
 * Day boundaries and open/close instants use Shop.timezone (via loadShopVenueTimeContext).
 */
export async function assertWithinOpeningHours(
  prisma: DbClient,
  shopId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const { resolvedTimeZone } = await loadShopVenueTimeContext(prisma, shopId);
  const startKey = calendarDayInTimeZone(resolvedTimeZone, startsAt);
  const endKey = calendarDayInTimeZone(resolvedTimeZone, endsAt);
  if (startKey !== endKey) {
    throw new BadRequestException(
      'Booking must start and end on the same day during opening hours.',
    );
  }

  const hours = await resolveDayHours(
    prisma,
    shopId,
    startKey,
    weekdayInTimeZone(startsAt, resolvedTimeZone),
  );
  if (hours.closed) {
    throw new BadRequestException('The venue is closed on this date.');
  }

  const open = zonedWallTimeToUtc(
    startKey,
    hours.opensAt!,
    resolvedTimeZone,
  );
  const close = zonedWallTimeToUtc(
    startKey,
    hours.closesAt!,
    resolvedTimeZone,
  );

  if (startsAt < open || endsAt > close) {
    throw new BadRequestException(
      `Booking must be within opening hours (${hours.opensAt}–${hours.closesAt}).`,
    );
  }
}

export type OpeningWindow = {
  dateKey: string;
  opensAt: Date;
  closesAt: Date;
};

/**
 * Venue-local opening windows intersecting [from,to). Schedule exceptions and
 * DST are resolved with the same source and timezone logic as booking checks.
 */
export async function listOpeningWindows(
  prisma: DbClient,
  shopId: string,
  from: Date,
  to: Date,
): Promise<OpeningWindow[]> {
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    to <= from
  ) {
    throw new BadRequestException('Opening-window range is invalid.');
  }
  const { resolvedTimeZone } = await loadShopVenueTimeContext(prisma, shopId);
  let key = calendarDayInTimeZone(resolvedTimeZone, from);
  const lastKey = calendarDayInTimeZone(
    resolvedTimeZone,
    new Date(to.getTime() - 1),
  );
  const windows: OpeningWindow[] = [];

  for (let guard = 0; guard < 3700; guard += 1) {
    const probe = zonedWallTimeToUtc(key, '12:00', resolvedTimeZone);
    const hours = await resolveDayHours(
      prisma,
      shopId,
      key,
      weekdayInTimeZone(probe, resolvedTimeZone),
    );
    if (!hours.closed) {
      const rawOpen = zonedWallTimeToUtc(key, hours.opensAt!, resolvedTimeZone);
      let rawClose = zonedWallTimeToUtc(key, hours.closesAt!, resolvedTimeZone);
      // Overnight opening hours are represented as close <= open. Interpret the
      // close on the following venue calendar date.
      if (rawClose <= rawOpen) {
        rawClose = zonedWallTimeToUtc(
          nextDateKey(key),
          hours.closesAt!,
          resolvedTimeZone,
        );
      }
      const opensAt = new Date(Math.max(rawOpen.getTime(), from.getTime()));
      const closesAt = new Date(Math.min(rawClose.getTime(), to.getTime()));
      if (closesAt > opensAt) windows.push({ dateKey: key, opensAt, closesAt });
    }
    if (key === lastKey) break;
    key = nextDateKey(key);
  }
  return windows;
}

function nextDateKey(key: string) {
  const { y, m, d } = parseDateKey(key);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
