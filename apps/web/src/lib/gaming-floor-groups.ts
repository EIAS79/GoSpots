import type { ScheduleCategorySection, ScheduleUnit } from "@/lib/reservations-client";
import type { SeatSectionMeta } from "@/components/reservations/seat-floor-map";
import { normalizeSeatingZone } from "@/lib/seating-zone";

export type FloorSectionGroup = {
  section: SeatSectionMeta | null;
  units: ScheduleUnit[];
};

export function buildFloorSectionGroups(
  units: ScheduleUnit[],
  sections: ScheduleCategorySection[] = [],
  mainAreaLabel = "Main area",
): FloorSectionGroup[] {
  const sectionMeta: SeatSectionMeta[] = sections.map((s) => ({
    id: s.id,
    name: s.name,
    floor: s.floor,
    isVip: s.isVip,
    seatsPerRow: s.seatsPerRow,
    sortOrder: s.sortOrder,
    zone: s.zone ?? null,
  }));

  const sorted = [...sectionMeta].sort(
    (a, b) =>
      a.floor - b.floor ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name),
  );

  const groups: FloorSectionGroup[] = [];
  const assigned = new Set<string>();

  for (const section of sorted) {
    const sectionUnits = units.filter((u) => u.section?.id === section.id);
    sectionUnits.forEach((u) => assigned.add(u.id));
    if (sectionUnits.length > 0) {
      groups.push({ section, units: sectionUnits });
    }
  }

  const unassigned = units.filter((u) => !u.section?.id && !assigned.has(u.id));
  if (unassigned.length > 0) {
    const floor = unassigned[0]?.section?.floor ?? 1;
    groups.push({
      section: {
        id: `unassigned-${floor}`,
        name: mainAreaLabel,
        floor,
        isVip: false,
        seatsPerRow: 6,
        sortOrder: 0,
        zone: null,
      },
      units: unassigned,
    });
  }

  if (groups.length === 0 && units.length > 0) {
    groups.push({
      section: {
        id: "main",
        name: mainAreaLabel,
        floor: 1,
        isVip: false,
        seatsPerRow: 6,
        sortOrder: 0,
        zone: null,
      },
      units,
    });
  }

  return groups;
}

export function groupSectionsByFloor(
  groups: FloorSectionGroup[],
): Map<number, FloorSectionGroup[]> {
  const floors = new Map<number, FloorSectionGroup[]>();
  for (const group of groups) {
    const floor = group.section?.floor ?? 1;
    const list = floors.get(floor) ?? [];
    list.push(group);
    floors.set(floor, list);
  }
  return new Map([...floors.entries()].sort(([a], [b]) => a - b));
}

export function layoutKey(group: FloorSectionGroup, index: number): string {
  return group.section?.id ?? `layout-${index}`;
}

export function layoutLabel(
  group: FloorSectionGroup,
  opts?: {
    mainAreaLabel?: string;
    zoneLabel?: (zone: string) => string;
  },
): string {
  const name = group.section?.name ?? opts?.mainAreaLabel ?? "Main area";
  const zone = group.section?.zone;
  if (zone && opts?.zoneLabel) {
    return `${name} · ${opts.zoneLabel(normalizeSeatingZone(zone))}`;
  }
  return name;
}
