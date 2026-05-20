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
