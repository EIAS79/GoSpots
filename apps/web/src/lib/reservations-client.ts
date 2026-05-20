import { api } from "./api";
import type { BookingUnitKind } from "./booking-unit-kind";
import type { UnitFloorStatus } from "./booking-floor-status";
import type { ResourceStatus, ResourceType } from "./resource-types";

export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELED"
  | "NO_SHOW";

export type Reservation = {
  id: string;
  resourceId: string | null;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  staffAlert: boolean;
  notes: string | null;
  resource: {
    id: string;
    name: string;
    type: ResourceType;
    category: { id: string; name: string; type: ResourceType } | null;
  } | null;
};

export type ScheduleBooking = {
  id: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  notes: string | null;
  staffAlert: boolean;
};

export type ScheduleAgendaItem = ScheduleBooking & {
  resourceId: string | null;
  unitName: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export type ScheduleUnit = {
  id: string;
  name: string;
  status: ResourceStatus;
  floorStatus: UnitFloorStatus;
  bookings: ScheduleBooking[];
};

export type DaySchedule = {
  date: string;
  categoryId: string | null;
  summary: {
    totalUnits: number;
    freeCount: number;
    bookedCount: number;
  };
  categories: ScheduleCategory[];
  agenda: ScheduleAgendaItem[];
};

export type ScheduleCategory = {
  id: string;
  name: string;
  type: ResourceType;
  unitKind: BookingUnitKind;
  unitLabels: {
    singular: string;
    plural: string;
    selectLabel: string;
    countLabel: string;
    createCountLabel: string;
  };
  slotMinutes: number;
  units: ScheduleUnit[];
};

export function fetchReservations(params?: {
  from?: string;
  to?: string;
  categoryId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.categoryId) q.set("categoryId", params.categoryId);
  const qs = q.toString();
  return api<{ reservations: Reservation[] }>(
    `/reservations${qs ? `?${qs}` : ""}`,
  );
}

export function fetchDaySchedule(date: string, categoryId?: string) {
  const q = new URLSearchParams({ date });
  if (categoryId) q.set("categoryId", categoryId);
  return api<DaySchedule>(`/reservations/schedule?${q}`);
}

export function createReservation(body: {
  resourceId?: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize?: number;
  startsAt: string;
  endsAt: string;
  status?: ReservationStatus;
  staffAlert?: boolean;
  notes?: string;
}) {
  return api<Reservation>("/reservations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateReservation(
  id: string,
  body: Partial<{
    resourceId: string | null;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
    partySize: number;
    startsAt: string;
    endsAt: string;
    status: ReservationStatus;
    staffAlert: boolean;
    notes: string | null;
  }>,
) {
  return api<Reservation>(`/reservations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteReservation(id: string) {
  return api(`/reservations/${id}`, { method: "DELETE" });
}
