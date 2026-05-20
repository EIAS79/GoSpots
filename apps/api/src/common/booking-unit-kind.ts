import type { ResourceType } from "@prisma/client";

/** How a game category is booked and shown on the floor schedule. */
export type BookingUnitKind = "SEAT" | "TABLE" | "LANE" | "UNIT";

/** Primary game types supported in v1 (more can be added later). */
export const FEATURED_GAME_TYPES: ResourceType[] = [
  "PC",
  "PLAYSTATION",
  "BILLIARD",
  "BOWLING",
];

export function getBookingUnitKind(type: ResourceType): BookingUnitKind {
  switch (type) {
    case "PC":
    case "PLAYSTATION":
      return "SEAT";
    case "BILLIARD":
    case "SNOOKER":
    case "POOL":
      return "TABLE";
    case "BOWLING":
      return "LANE";
    default:
      return "UNIT";
  }
}

export function getBookingUnitLabels(kind: BookingUnitKind) {
  switch (kind) {
    case "SEAT":
      return {
        singular: "seat",
        plural: "seats",
        selectLabel: "Seat",
        countLabel: "Players",
        createCountLabel: "How many seats to create",
      };
    case "TABLE":
      return {
        singular: "table",
        plural: "tables",
        selectLabel: "Table",
        countLabel: "Players",
        createCountLabel: "How many tables to create",
      };
    case "LANE":
      return {
        singular: "lane",
        plural: "lanes",
        selectLabel: "Lane",
        countLabel: "Players",
        createCountLabel: "How many lanes to create",
      };
    default:
      return {
        singular: "unit",
        plural: "units",
        selectLabel: "Unit",
        countLabel: "Party size",
        createCountLabel: "How many units to create",
      };
  }
}

export function defaultUnitNamePrefix(
  type: ResourceType,
  categoryName?: string,
): string {
  const kind = getBookingUnitKind(type);
  if (kind === "SEAT") {
    return type === "PLAYSTATION" ? "Station" : "Seat";
  }
  if (kind === "TABLE") return "Table";
  if (kind === "LANE") return "Lane";
  return categoryName?.trim() || "Unit";
}

export function featuredTypeSortIndex(type: ResourceType): number {
  const i = FEATURED_GAME_TYPES.indexOf(type);
  return i === -1 ? 100 : i;
}
