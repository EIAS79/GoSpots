import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseTimeOnDate(dateKey: string, time: string): Date {
  return new Date(`${dateKey}T${time}:00`);
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function resolveDayHours(
  prisma: PrismaClient,
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

/** Booking must fit inside venue opening hours for the start date. */
export async function assertWithinOpeningHours(
  prisma: PrismaClient,
  shopId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const startKey = localDateKey(startsAt);
  const endKey = localDateKey(endsAt);
  if (startKey !== endKey) {
    throw new BadRequestException(
      'Booking must start and end on the same day during opening hours.',
    );
  }

  const hours = await resolveDayHours(
    prisma,
    shopId,
    startKey,
    startsAt.getDay(),
  );
  if (hours.closed) {
    throw new BadRequestException('The venue is closed on this date.');
  }

  const open = parseTimeOnDate(startKey, hours.opensAt!);
  const close = parseTimeOnDate(startKey, hours.closesAt!);

  if (startsAt < open || endsAt > close) {
    throw new BadRequestException(
      `Booking must be within opening hours (${hours.opensAt}–${hours.closesAt}).`,
    );
  }
}
