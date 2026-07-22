export type SeatingZone = "INDOOR" | "OUTDOOR";

export const SEATING_ZONES: SeatingZone[] = ["INDOOR", "OUTDOOR"];

export const SEATING_ZONE_LABELS: Record<SeatingZone, string> = {
  INDOOR: "Indoors",
  OUTDOOR: "Outdoors",
};

export const SEATING_ZONE_HINTS: Record<SeatingZone, string> = {
  INDOOR: "Main dining room, bar interior, covered hall",
  OUTDOOR: "Patio, terrace, garden, sidewalk seating",
};

export function normalizeSeatingZone(value: unknown): SeatingZone {
  return value === "OUTDOOR" ? "OUTDOOR" : "INDOOR";
}

/** Localized label for a seating zone — pass the venue-settings `t()`. */
export function seatingZoneLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  zone: SeatingZone | string | null | undefined,
): string {
  const normalized = normalizeSeatingZone(zone);
  return t(`diningSetup.zone.${normalized}`);
}
