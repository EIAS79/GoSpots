import { coerceMoney, type MoneyWire } from "./money";

/** Hourly zone surcharge, pro-rated by the actual selected/billed duration. */
export function zoneHourlyAddonAmount(
  hourlyPriceAddon: MoneyWire | null | undefined,
  durationMinutes: number,
): number {
  const rate = Math.max(0, coerceMoney(hourlyPriceAddon ?? 0));
  const minutes = Math.max(0, durationMinutes);
  return Math.round(rate * (minutes / 60) * 100) / 100;
}

export function applyZoneHourlyAddon(
  basePrice: number | null,
  hourlyPriceAddon: MoneyWire | null | undefined,
  durationMinutes: number,
): number | null {
  if (basePrice == null) return null;
  const addon = zoneHourlyAddonAmount(hourlyPriceAddon, durationMinutes);
  return Math.round((basePrice + addon) * 100) / 100;
}
