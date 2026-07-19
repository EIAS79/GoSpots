import type { MealPeriod } from "./menu-periods";
import { mealPeriodLabel } from "./menu-periods";
import type { MenuItem, MenuSection } from "./menu-client";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatWeekdays(csv: string) {
  const days = csv
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  if (days.length === 7) return "Every day";
  if (
    days.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => days.includes(d))
  ) {
    return "Mon–Fri";
  }
  return days.map((d) => WEEKDAY_LABELS[d] ?? d).join(", ");
}

export function formatTimeRange(from: string | null, to: string | null) {
  if (!from && !to) return null;
  if (from && to) return `${from} – ${to}`;
  return from ?? to;
}

export function sectionTimingLabel(section: MenuSection) {
  const period = mealPeriodLabel(section.mealPeriod as MealPeriod | null);
  const range = formatTimeRange(section.availableFrom, section.availableTo);
  const days = formatWeekdays(section.availableDays);
  const parts = [period, range, days].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function itemTimingLabel(
  item: MenuItem,
  section: MenuSection | undefined,
) {
  if (item.useSectionTiming && section) {
    const inherited = sectionTimingLabel(section);
    return inherited ? `Section: ${inherited}` : "Same hours as section";
  }
  const range = formatTimeRange(item.availableFrom, item.availableTo);
  const days = formatWeekdays(item.availableDays);
  const parts = [range, days].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Always available";
}

function parseDays(csv: string): number[] {
  return csv
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

function minutesFromTime(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map((p) => parseInt(p, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function isWithinTimeWindow(
  now: Date,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesFromTime(from) ?? 0;
  const end = minutesFromTime(to) ?? 24 * 60 - 1;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

/** Whether a menu item can be added to an order right now. */
export function isItemOrderableNow(
  item: MenuItem,
  section: MenuSection | undefined,
  now: Date = new Date(),
): boolean {
  if (!item.isAvailable) return false;
  if (item.trackStock && item.stock <= 0) return false;

  const useSection = item.useSectionTiming && section;
  const days = parseDays(
    useSection ? section!.availableDays : item.availableDays,
  );
  if (days.length > 0 && !days.includes(now.getDay())) return false;

  const from = useSection ? section!.availableFrom : item.availableFrom;
  const to = useSection ? section!.availableTo : item.availableTo;
  return isWithinTimeWindow(now, from, to);
}

export function itemOutOfStock(item: MenuItem): boolean {
  return Boolean(item.trackStock && item.stock <= 0);
}

export type MenuTimingFields = {
  useSectionTiming: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: string;
};

export type MenuSectionTimingFields = {
  mealPeriod?: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: string;
};

function resolveEffectiveTiming(
  item: MenuTimingFields,
  section?: MenuSectionTimingFields | null,
) {
  if (item.useSectionTiming && section) {
    return {
      availableFrom: section.availableFrom,
      availableTo: section.availableTo,
      availableDays: section.availableDays,
      mealPeriod: section.mealPeriod ?? null,
    };
  }
  return {
    availableFrom: item.availableFrom,
    availableTo: item.availableTo,
    availableDays: item.availableDays,
    mealPeriod: null as string | null,
  };
}

export function publicMenuScheduleLabel(
  item: MenuTimingFields,
  section?: MenuSectionTimingFields | null,
) {
  const timing = resolveEffectiveTiming(item, section);
  const period = mealPeriodLabel(timing.mealPeriod as MealPeriod | null);
  const range = formatTimeRange(timing.availableFrom, timing.availableTo);
  const days = formatWeekdays(timing.availableDays);
  const parts = [period, range, days].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Available all day, every day";
}

export type PublicMenuAvailability = {
  availableNow: boolean;
  headline: string;
  schedule: string;
  tone: "available" | "sold-out" | "later" | "closed";
};

function findNextWeekday(fromDay: number, allowed: number[]): number | null {
  if (!allowed.length) return null;
  for (let offset = 1; offset <= 7; offset++) {
    const day = (fromDay + offset) % 7;
    if (allowed.includes(day)) return day;
  }
  return null;
}

const FULL_WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Live availability for public menu cards and item modal. */
export function getPublicMenuItemAvailability(
  item: MenuTimingFields & { trackStock: boolean; inStock: boolean },
  section?: MenuSectionTimingFields | null,
  now: Date = new Date(),
): PublicMenuAvailability {
  const schedule = publicMenuScheduleLabel(item, section);

  if (item.trackStock && !item.inStock) {
    return {
      availableNow: false,
      headline: "Sold out",
      schedule,
      tone: "sold-out",
    };
  }

  const timing = resolveEffectiveTiming(item, section);
  const days = parseDays(timing.availableDays);
  const today = now.getDay();
  const onAllowedDay = days.length === 0 || days.includes(today);
  const inWindow = isWithinTimeWindow(
    now,
    timing.availableFrom,
    timing.availableTo,
  );

  if (onAllowedDay && inWindow) {
    return {
      availableNow: true,
      headline: "Available now",
      schedule,
      tone: "available",
    };
  }

  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesFromTime(timing.availableFrom);
  const end = minutesFromTime(timing.availableTo);

  if (onAllowedDay && start !== null && current < start && timing.availableFrom) {
    return {
      availableNow: false,
      headline: `Opens at ${timing.availableFrom}`,
      schedule,
      tone: "later",
    };
  }

  if (!onAllowedDay) {
    const next = findNextWeekday(today, days);
    const headline =
      next === (today + 1) % 7
        ? timing.availableFrom
          ? `Available tomorrow from ${timing.availableFrom}`
          : "Available tomorrow"
        : next !== null
          ? timing.availableFrom
            ? `Available ${FULL_WEEKDAY_LABELS[next]} from ${timing.availableFrom}`
            : `Available ${FULL_WEEKDAY_LABELS[next]}`
          : "Not available today";
    return {
      availableNow: false,
      headline,
      schedule,
      tone: "closed",
    };
  }

  const next = findNextWeekday(today, days);
  if (end !== null && current > end) {
    const headline =
      next === (today + 1) % 7
        ? timing.availableFrom
          ? `Available tomorrow from ${timing.availableFrom}`
          : "Available tomorrow"
        : next !== null && timing.availableFrom
          ? `Available ${FULL_WEEKDAY_LABELS[next]} from ${timing.availableFrom}`
          : "Not available right now";
    return {
      availableNow: false,
      headline,
      schedule,
      tone: "closed",
    };
  }

  return {
    availableNow: false,
    headline: "Not available right now",
    schedule,
    tone: "closed",
  };
}
