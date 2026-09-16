import type { ReservationStatus } from "./reservations-client";
import { getViewerTimeZone } from "./viewer-timezone";

export const ACTIVE_BOOKING_STATUSES: ReservationStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
];

export function isActiveBookingStatus(status: ReservationStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

export type SessionBookingPhase =
  | "upcoming"
  | "waiting"
  | "in_use"
  | "completed"
  | "no_show"
  | "canceled";

/** @deprecated use SessionBookingPhase */
export type DiningBookingPhase = SessionBookingPhase;

export const SESSION_BOOKING_PHASE_LABELS: Record<SessionBookingPhase, string> = {
  upcoming: "Upcoming",
  waiting: "Waiting guest",
  in_use: "In use",
  completed: "Completed",
  no_show: "No-show",
  canceled: "Canceled",
};

/** @deprecated use SESSION_BOOKING_PHASE_LABELS */
export const DINING_BOOKING_PHASE_LABELS = SESSION_BOOKING_PHASE_LABELS;

/** @deprecated use SESSION_BOOKING_PHASE_LABELS */
export const BOOKING_PHASE_LABELS = {
  upcoming: "Upcoming",
  active: "In progress",
  canceled: "Canceled",
  completed: "Completed",
} as const;

export type BookingPhase = keyof typeof BOOKING_PHASE_LABELS;

/**
 * Session-style bookings: arrival time + no-show grace, then open session after check-in.
 */
export function resolveSessionBookingPhase(
  status: ReservationStatus | string,
  startsAt: string | Date,
  endsAt: string | Date,
  nowMs: number = Date.now(),
): SessionBookingPhase {
  if (status === "NO_SHOW") return "no_show";
  if (status === "CANCELED") return "canceled";
  if (status === "COMPLETED") return "completed";
  if (status === "CHECKED_IN") return "in_use";

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "upcoming";

  if (nowMs < start) return "upcoming";
  if (nowMs >= start && nowMs < end) return "waiting";
  return "no_show";
}

/** @deprecated use resolveSessionBookingPhase */
export const resolveDiningBookingPhase = resolveSessionBookingPhase;

export function isLiveBooking<
  T extends { status: ReservationStatus; startsAt: string; endsAt: string },
>(b: T, nowMs: number = Date.now()): boolean {
  if (!isActiveBookingStatus(b.status)) return false;
  const phase = resolveSessionBookingPhase(
    b.status,
    b.startsAt,
    b.endsAt,
    nowMs,
  );
  return phase === "upcoming" || phase === "waiting" || phase === "in_use";
}

/** @deprecated use isLiveBooking */
export const isDiningBookingLive = isLiveBooking;

export function countActiveBookings<
  T extends { status: ReservationStatus; endsAt: string; startsAt: string },
>(bookings: T[], nowMs: number = Date.now()): number {
  return bookings.filter((b) => isLiveBooking(b, nowMs)).length;
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function formatterForZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function partsInZone(value: Date, timeZone: string): DateTimeParts {
  const parts = formatterForZone(timeZone).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetAt(value: Date, timeZone: string): number {
  const p = partsInZone(value, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    value.getTime()
  );
}

export function combineDateAndTimeInZone(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (
    !year ||
    !month ||
    !day ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return new Date(Number.NaN);
  }

  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let instant = new Date(wallClockUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Date(wallClockUtc - offsetAt(instant, timeZone));
    if (next.getTime() === instant.getTime()) break;
    instant = next;
  }
  return instant;
}

export function splitDateAndTimeInZone(
  iso: string,
  timeZone: string,
): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const p = partsInZone(d, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

export function localDateInput(d = new Date()): string {
  return splitDateAndTimeInZone(d.toISOString(), getViewerTimeZone()).date;
}

/**
 * Reservation fields are interpreted in the current visitor/device timezone.
 * The API receives an absolute ISO instant and validates opening hours in the
 * venue's own configured timezone.
 */
export function combineDateAndTime(date: string, time: string): Date {
  return combineDateAndTimeInZone(date, time, getViewerTimeZone());
}

export function splitDateAndTime(iso: string): { date: string; time: string } {
  return splitDateAndTimeInZone(iso, getViewerTimeZone());
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total / 60) % 24);
  const nm = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(nh)}:${pad(nm)}`;
}

/** @deprecated session bookings use arrival time only */
export function validateBookingWindow(
  date: string,
  startTime: string,
  endTime: string,
): string | null {
  if (!date || !startTime) {
    return "Pick a date and arrival time.";
  }
  if (!endTime) return null;
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

/** @deprecated use resolveSessionBookingPhase */
export function resolveBookingPhase(
  status: ReservationStatus | string,
  startsAt: string | Date,
  endsAt: string | Date,
  nowMs: number = Date.now(),
): BookingPhase {
  const phase = resolveSessionBookingPhase(
    status,
    startsAt,
    endsAt,
    nowMs,
  );
  if (phase === "waiting" || phase === "in_use") return "active";
  if (phase === "no_show" || phase === "canceled") return "canceled";
  if (phase === "completed") return "completed";
  return "upcoming";
}

export function isBookingInProgress<
  T extends { status: ReservationStatus; startsAt: string; endsAt: string },
>(b: T, nowMs: number = Date.now()): boolean {
  const phase = resolveSessionBookingPhase(
    b.status,
    b.startsAt,
    b.endsAt,
    nowMs,
  );
  return phase === "waiting" || phase === "in_use";
}

export function isSessionBlockingBooking(
  b: { status: ReservationStatus; startsAt: string; endsAt: string },
  nowMs: number = Date.now(),
): boolean {
  const phase = resolveSessionBookingPhase(
    b.status,
    b.startsAt,
    b.endsAt,
    nowMs,
  );
  return phase === "waiting" || phase === "in_use";
}
