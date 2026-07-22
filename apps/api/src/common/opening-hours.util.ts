import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { loadShopVenueTimeContext } from './shop-venue-time.util';
import {
  calendarDayInTimeZone,
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
