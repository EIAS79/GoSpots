import type { BookingUnitKind } from "./booking-unit-kind";
import type { ResourceType } from "./resource-types";

export type FloorMapVisualType =
  | "pc"
  | "playstation"
  | "billiard"
  | "pingpong"
  | "foosball"
  | "arcade"
  | "dining";

export function getFloorMapVisualType(type: ResourceType): FloorMapVisualType {
  switch (type) {
    case "DINING":
      return "dining";
    case "PLAYSTATION":
      return "playstation";
    case "BILLIARD":
      return "billiard";
    case "TABLE_TENNIS":
      return "pingpong";
    case "FOOSBALL":
      return "foosball";
    case "ARCADE":
      return "arcade";
    default:
      return "pc";
  }
}

export function supportsGamingLayout(unitKind: BookingUnitKind): boolean {
  return unitKind === "SEAT" || unitKind === "TABLE" || unitKind === "LANE";
}

export function layoutMapLabel(
  type: ResourceType,
  unitKind: BookingUnitKind,
): string {
  if (type === "DINING") return "Live table map";
  if (type === "BOWLING" || unitKind === "LANE") return "Live lane map";
  if (unitKind === "TABLE") return "Live table map";
  return "Live station map";
}

export function layoutTapHint(visualType: FloorMapVisualType): string {
  if (visualType === "dining") {
    return "Tap a table that fits your party size to book";
  }
  if (visualType === "billiard" || visualType === "pingpong" || visualType === "foosball") {
    return "Tap a table to book or view the active session";
  }
  if (visualType === "arcade") {
    return "Tap a cabinet to book or view the active session";
  }
  return "Tap a seat to book or view the active session";
}

export function layoutScreenLabel(visualType: FloorMapVisualType): string {
  switch (visualType) {
    case "dining":
    case "billiard":
    case "pingpong":
    case "foosball":
      return "Tables";
    case "arcade":
      return "Cabinets";
    case "playstation":
      return "Stations";
    default:
      return "Screen";
  }
}
