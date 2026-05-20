import type { ReservationStatus } from "./reservations-client";

export const ACTIVE_BOOKING_STATUSES: ReservationStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
];

export function isActiveBookingStatus(status: ReservationStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

/**
 * Live = active by status AND its end time has not passed yet. Useful so the
 * UI hides expired bookings the moment the clock crosses `endsAt`, without
 * waiting for the backend cron to flip the status to COMPLETED.
 */
export function isLiveBooking<
  T extends { status: ReservationStatus; endsAt: string },
>(b: T, nowMs: number = Date.now()): boolean {
  if (!isActiveBookingStatus(b.status)) return false;
  return new Date(b.endsAt).getTime() > nowMs;
}

export function countActiveBookings<
  T extends { status: ReservationStatus; endsAt: string },
>(bookings: T[], nowMs: number = Date.now()): number {
  return bookings.filter((b) => isLiveBooking(b, nowMs)).length;
}

export function localDateInput(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function combineDateAndTime(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

export function splitDateAndTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total / 60) % 24);
  const nm = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(nh)}:${pad(nm)}`;
}

/** End must be strictly after start (same calendar day for game bookings). */
export function validateBookingWindow(
  date: string,
  startTime: string,
  endTime: string,
): string | null {
  if (!date || !startTime || !endTime) {
    return "Pick a date, start time, and end time.";
  }
  const start = combineDateAndTime(date, startTime);
  const end = combineDateAndTime(date, endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Invalid date or time.";
  }
  if (end <= start) {
    return "End time must be after start time on the same day.";
  }
  return null;
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}
