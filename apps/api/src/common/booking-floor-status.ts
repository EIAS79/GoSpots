import { ReservationStatus, ResourceStatus } from '@prisma/client';

export type UnitFloorStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_WORKING';

export const ACTIVE_RESERVATION: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

export function dayBoundsLocal(dateStr: string): {
  dayStart: Date;
  dayEnd: Date;
} {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error('Invalid date');
  }
  return {
    dayStart: new Date(y, m - 1, d, 0, 0, 0, 0),
    dayEnd: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

export function isSameLocalCalendarDay(a: Date, dateStr: string): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`;
  return local === dateStr;
}

/** Session-style units: blocked only while waiting for guest or checked in. */
export function computeUnitFloorStatus(
  unitDbStatus: ResourceStatus,
  bookings: { status: ReservationStatus; startsAt: Date; endsAt: Date }[],
  at: Date,
  scheduleDate: string,
): UnitFloorStatus {
  if (unitDbStatus === ResourceStatus.MAINTENANCE) {
    return 'NOT_WORKING';
  }
  if (!isSameLocalCalendarDay(at, scheduleDate)) {
    return 'AVAILABLE';
  }

  for (const b of bookings) {
    if (!ACTIVE_RESERVATION.includes(b.status)) continue;
    if (b.status === ReservationStatus.CHECKED_IN && b.startsAt <= at) {
      return 'UNAVAILABLE';
    }
    if (
      (b.status === ReservationStatus.CONFIRMED ||
        b.status === ReservationStatus.PENDING) &&
      b.startsAt <= at &&
      b.endsAt > at
    ) {
      return 'UNAVAILABLE';
    }
  }
  return 'AVAILABLE';
}
