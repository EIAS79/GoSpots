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
