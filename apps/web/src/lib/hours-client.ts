import { api } from "./api";

export type OpeningHourRow = {
  id: string | null;
  shopId: string;
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type ScheduleException = {
  id: string;
  shopId: string;
  date: string;
  label: string | null;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type VenueSchedule = {
  weekly: OpeningHourRow[];
  exceptions: ScheduleException[];
};

export function fetchSchedule() {
  return api<VenueSchedule>("/hours");
}

export function saveWeeklyHours(
  days: {
    weekday: number;
    isClosed: boolean;
    opensAt?: string;
    closesAt?: string;
  }[],
) {
  return api<VenueSchedule>("/hours/weekly", {
    method: "PUT",
    body: JSON.stringify({ days }),
  });
}

export function createScheduleException(body: {
  date: string;
  label?: string;
  isClosed: boolean;
  opensAt?: string;
  closesAt?: string;
}) {
  return api<ScheduleException>("/hours/exceptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateScheduleException(
  id: string,
  body: {
    date?: string;
    label?: string | null;
    isClosed?: boolean;
    opensAt?: string;
    closesAt?: string;
  },
) {
  return api<ScheduleException>(`/hours/exceptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteScheduleException(id: string) {
  return api(`/hours/exceptions/${id}`, { method: "DELETE" });
}
