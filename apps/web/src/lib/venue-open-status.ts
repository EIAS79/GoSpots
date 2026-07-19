import type { PublicOpeningHour, PublicScheduleException } from "./shop-settings-client";

export type VenueOpenState = "open" | "closed" | "opens-later" | "unknown";

export type VenueOpenStatus = {
  state: VenueOpenState;
  label: string;
  window: string | null;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function todayDateLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Live open/closed status from weekly hours and optional date exceptions. */
export function venueOpenStatus(
  hours?: PublicOpeningHour[],
  exceptions?: PublicScheduleException[],
): VenueOpenStatus {
  const todayKey = todayDateLocal();
  const exception = exceptions?.find((e) => e.date === todayKey);

  if (exception) {
    if (exception.isClosed) {
      return {
        state: "closed",
        label: exception.label
          ? `Closed · ${exception.label}`
          : "Closed today",
        window: null,
      };
    }
    if (exception.opensAt && exception.closesAt) {
      return statusFromDayHours({
        weekday: new Date().getDay(),
        opensAt: exception.opensAt,
        closesAt: exception.closesAt,
        isClosed: false,
      }, exception.label);
    }
  }

  return statusFromWeeklyHours(hours);
}

function statusFromWeeklyHours(hours?: PublicOpeningHour[]): VenueOpenStatus {
  if (!hours?.length) {
    return { state: "unknown", label: "Hours not set", window: null };
  }
  const now = new Date();
  const weekday = now.getDay();
  const today = hours.find((h) => h.weekday === weekday);
  const yesterday = hours.find((h) => h.weekday === (weekday + 6) % 7);
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (yesterday && !yesterday.isClosed) {
    const opens = toMinutes(yesterday.opensAt);
    const closes = toMinutes(yesterday.closesAt);
    if (closes < opens && minutes < closes) {
      return {
        state: "open",
        label: `Open · until ${yesterday.closesAt}`,
        window: `${yesterday.opensAt} – ${yesterday.closesAt}`,
      };
    }
  }

  if (!today || today.isClosed) {
    return { state: "closed", label: "Closed today", window: null };
  }

  return statusFromDayHours(today);
}

function statusFromDayHours(
  today: PublicOpeningHour,
  specialLabel?: string | null,
): VenueOpenStatus {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const opens = toMinutes(today.opensAt);
  const closes = toMinutes(today.closesAt);
  const window = `${today.opensAt} – ${today.closesAt}`;
  const overnight = closes < opens;
  const prefix = specialLabel ? `${specialLabel} · ` : "";

  if (minutes < opens) {
    return {
      state: "opens-later",
      label: `${prefix}Opens ${today.opensAt}`,
      window,
    };
  }
  if (overnight || minutes < closes) {
    return {
      state: "open",
      label: `${prefix}Open · until ${today.closesAt}`,
      window,
    };
  }
  return { state: "closed", label: `${prefix}Closed now`, window };
}
