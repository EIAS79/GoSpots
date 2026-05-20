import type { ResourceType } from "./resource-types";
import { RESOURCE_TYPE_LABELS } from "./resource-types";

export type BookingUnitKind = "SEAT" | "TABLE" | "LANE" | "UNIT";

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
        layoutHint: "Book individual seats (PC stations, PlayStation booths).",
      };
    case "TABLE":
      return {
        singular: "table",
        plural: "tables",
        selectLabel: "Table",
        countLabel: "Players",
        createCountLabel: "How many tables to create",
        layoutHint: "Book billiard / pool tables one at a time.",
      };
    case "LANE":
      return {
        singular: "lane",
        plural: "lanes",
        selectLabel: "Lane",
        countLabel: "Players",
        createCountLabel: "How many lanes to create",
        layoutHint: "Book bowling lanes individually.",
      };
    default:
      return {
        singular: "unit",
        plural: "units",
        selectLabel: "Unit",
        countLabel: "Party size",
        createCountLabel: "How many units to create",
        layoutHint: "Generic units for this activity.",
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

/** Featured types first, then other configured categories. */
export function sortScheduleCategories<T extends { type: ResourceType }>(
  categories: T[],
): T[] {
  return [...categories].sort((a, b) => {
    const ai = FEATURED_GAME_TYPES.indexOf(a.type);
    const bi = FEATURED_GAME_TYPES.indexOf(b.type);
    const aRank = ai === -1 ? 50 + a.type.localeCompare("") : ai;
    const bRank = bi === -1 ? 50 + b.type.localeCompare("") : bi;
    return aRank - bRank;
  });
}

export const GAMING_SPEC_PLACEHOLDERS: Partial<Record<ResourceType, string>> = {
  PC: "e.g. RTX 3060, 144Hz monitors, mechanical keyboards, Windows 11…",
  PLAYSTATION: "e.g. PS5, 4K TV, DualSense controllers, game library…",
  BILLIARD: "e.g. 9ft tables, Simonis cloth, tournament cues…",
  BOWLING: "e.g. 6 lanes, automatic scoring, shoe rental included…",
};

export const GAMING_DEFAULT_NAMES: Partial<Record<ResourceType, string>> = {
  PC: "PC Gaming",
  PLAYSTATION: "PlayStation Lounge",
  BILLIARD: "Billiard",
  BOWLING: "Bowling Lanes",
};

export const GAME_BOOKING_TYPE_OPTIONS: {
  value: ResourceType;
  label: string;
  featured: boolean;
}[] = [
  ...FEATURED_GAME_TYPES.map((value) => ({
    value,
    label: RESOURCE_TYPE_LABELS[value],
    featured: true,
  })),
  ...(
    Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]
  )
    .filter((t) => !FEATURED_GAME_TYPES.includes(t))
    .map((value) => ({
      value,
      label: RESOURCE_TYPE_LABELS[value],
      featured: false,
    })),
];
