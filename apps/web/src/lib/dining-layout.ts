import type { SeatingZone } from "./seating-zone";

/** Seat counts staff can assign per table type in a dining area. */
export const DINING_TABLE_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type DiningTableSize = (typeof DINING_TABLE_SIZES)[number];

/** Internal default — not shown to staff; guests pick time on the public map. */
export const DINING_DEFAULT_SLOT_MINUTES = 120;

export function normalizeDiningTableSize(value: unknown): DiningTableSize {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (n >= 1 && n <= 8) return n as DiningTableSize;
  return 4;
}

/** @deprecated Use `seatingZoneLabel(t, zone)` from `./seating-zone` for a localized label. */
export function diningZoneLabel(zone: SeatingZone | string | null | undefined) {
  return zone === "OUTDOOR" ? "Outdoors" : "Indoors";
}

export function diningTableGroupLabel(
  name: string | null | undefined,
  capacity: number,
  t?: (key: string, vars?: Record<string, string | number>) => string,
) {
  const trimmed = name?.trim();
  if (trimmed && trimmed !== `${capacity}-seat table`) return trimmed;
  if (t) {
    return capacity === 1
      ? t("diningSetup.tableFallbackOne")
      : t("diningSetup.tableFallbackMany", { capacity });
  }
  return capacity === 1 ? "1-top table" : `${capacity}-top tables`;
}
