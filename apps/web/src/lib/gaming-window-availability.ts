import type { UnitFloorStatus } from "@/lib/booking-floor-status";
import {
  combineDateAndTime,
  intervalsOverlap,
  isActiveBookingStatus,
} from "@/lib/booking-time";
import type { ScheduleBooking, ScheduleUnit } from "@/lib/reservations-client";
import type { ResourceStatus } from "@/lib/resource-types";

export function formatTimeShort(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatWindowLabel(
  date: string,
  startTime: string,
  endTime: string,
) {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${startTime} – ${endTime}`;
}

export function findBlockingBooking(
  bookings: ScheduleBooking[],
  windowStart: Date,
  windowEnd: Date,
): ScheduleBooking | null {
  return (
    bookings.find((b) => {
      if (!isActiveBookingStatus(b.status)) return false;
      const bStart = new Date(b.startsAt);
      const bEnd = new Date(b.endsAt);
      return intervalsOverlap(windowStart, windowEnd, bStart, bEnd);
    }) ?? null
  );
}

export function computeWindowFloorStatus(
  unitDbStatus: ResourceStatus,
  bookings: ScheduleBooking[],
  windowStart: Date,
  windowEnd: Date,
): UnitFloorStatus {
  if (unitDbStatus === "MAINTENANCE") return "NOT_WORKING";
  const blocking = findBlockingBooking(bookings, windowStart, windowEnd);
  return blocking ? "UNAVAILABLE" : "AVAILABLE";
}

export function applyWindowToUnit(
  unit: ScheduleUnit,
  date: string,
  startTime: string,
  endTime: string,
): ScheduleUnit {
  const windowStart = combineDateAndTime(date, startTime);
  const windowEnd = combineDateAndTime(date, endTime);
  const floorStatus = computeWindowFloorStatus(
    unit.status,
    unit.bookings,
    windowStart,
    windowEnd,
  );
  return { ...unit, floorStatus };
}

export function applyWindowToUnits(
  units: ScheduleUnit[],
  date: string,
  startTime: string,
  endTime: string,
): ScheduleUnit[] {
  return units.map((u) => applyWindowToUnit(u, date, startTime, endTime));
}

export function buildBlockingMap(
  units: ScheduleUnit[],
  date: string,
  startTime: string,
  endTime: string,
): Record<string, ScheduleBooking> {
  const windowStart = combineDateAndTime(date, startTime);
  const windowEnd = combineDateAndTime(date, endTime);
  const map: Record<string, ScheduleBooking> = {};
  for (const unit of units) {
    const blocking = findBlockingBooking(unit.bookings, windowStart, windowEnd);
    if (blocking) map[unit.id] = blocking;
  }
  return map;
}

export function defaultCheckWindowTimes(slotMinutes = 60) {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const endH = d.getHours();
  const endM = d.getMinutes() + slotMinutes;
  const endDate = new Date(d);
  endDate.setHours(endH, endM, 0, 0);
  const end = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  return { start, end };
}

export function hasWindowOverlapWithBookings(
  unit: ScheduleUnit,
  date: string,
  startTime: string,
  endTime: string,
): ScheduleBooking | null {
  const windowStart = combineDateAndTime(date, startTime);
  const windowEnd = combineDateAndTime(date, endTime);
  return findBlockingBooking(unit.bookings, windowStart, windowEnd);
}
