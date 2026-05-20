import { api } from "./api";
import { normalizeFloor } from "./seating-floor";
import {
  normalizeSeatingZone,
  type SeatingZone,
} from "./seating-zone";

export type { SeatingZone };

export type SeatingTableGroup = {
  id: string;
  label: string;
  zone: SeatingZone;
  floor: number;
  capacity: number;
  totalCount: number;
  availableCount: number;
  note: string | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  isCustom: boolean;
  sortOrder: number;
};

export type SeatingTablesSummary = {
  totalTables: number;
  availableTables: number;
  totalSeats: number;
  availableSeats: number;
};

export type SeatingTablesResponse = {
  groups: SeatingTableGroup[];
  summary: SeatingTablesSummary;
  byZone: Record<SeatingZone, SeatingTablesSummary>;
  floorCount: number;
};

export function recalcSeatingSummary(
  groups: SeatingTableGroup[],
): SeatingTablesSummary {
  return groups.reduce(
    (acc, g) => {
      acc.totalTables += g.totalCount;
      acc.availableTables += g.availableCount;
      acc.totalSeats += g.totalCount * g.capacity;
      acc.availableSeats += g.availableCount * g.capacity;
      return acc;
    },
    {
      totalTables: 0,
      availableTables: 0,
      totalSeats: 0,
      availableSeats: 0,
    },
  );
}

/** Ensures API / local state always has `groups` as an array (guards bad patches). */
export function normalizeSeatingTablesResponse(
  raw: unknown,
): SeatingTablesResponse {
  const payload = raw as Partial<SeatingTablesResponse> | null | undefined;
  const floorCount = normalizeFloor(
    (payload as { floorCount?: number })?.floorCount,
    10,
  );
  const groups = (Array.isArray(payload?.groups) ? payload.groups : []).map(
    (g) => ({
      ...g,
      zone: normalizeSeatingZone(g.zone),
      floor: normalizeFloor(g.floor, floorCount),
      eventStartsAt: g.eventStartsAt ?? null,
      eventEndsAt: g.eventEndsAt ?? null,
    }),
  );
  const summary =
    payload?.summary &&
    typeof payload.summary === "object" &&
    !Array.isArray(payload.summary)
      ? {
          totalTables: Number(payload.summary.totalTables) || 0,
          availableTables: Number(payload.summary.availableTables) || 0,
          totalSeats: Number(payload.summary.totalSeats) || 0,
          availableSeats: Number(payload.summary.availableSeats) || 0,
        }
      : recalcSeatingSummary(groups);
  const byZoneRaw = payload?.byZone as
    | Partial<Record<SeatingZone, SeatingTablesSummary>>
    | undefined;
  const byZone: Record<SeatingZone, SeatingTablesSummary> = {
    INDOOR: byZoneRaw?.INDOOR ?? recalcSeatingSummary(groups.filter((g) => g.zone === "INDOOR")),
    OUTDOOR:
      byZoneRaw?.OUTDOOR ?? recalcSeatingSummary(groups.filter((g) => g.zone === "OUTDOOR")),
  };
  return { groups, summary, byZone, floorCount };
}

export function fetchSeatingTables() {
  return api<unknown>("/seating-tables").then(normalizeSeatingTablesResponse);
}

export function createSeatingTableGroup(body: {
  label?: string;
  zone?: SeatingZone;
  floor?: number;
  capacity: number;
  totalCount: number;
  availableCount?: number;
  note?: string;
  isCustom?: boolean;
  eventStartsAt?: string;
  eventEndsAt?: string;
}) {
  return api<SeatingTableGroup>("/seating-tables", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSeatingTableGroup(
  id: string,
  body: Partial<{
    label: string;
    capacity: number;
    totalCount: number;
    availableCount: number;
    note: string | null;
    zone: SeatingZone;
    floor: number;
    eventStartsAt: string | null;
    eventEndsAt: string | null;
    sortOrder: number;
  }>,
) {
  return api<SeatingTableGroup>(`/seating-tables/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteSeatingTableGroup(id: string) {
  return api<{ ok: boolean }>(`/seating-tables/${id}`, { method: "DELETE" });
}
