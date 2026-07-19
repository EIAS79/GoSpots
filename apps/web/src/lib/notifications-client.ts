import { API_BASE_URL, ApiError, api } from "./api";
import { getVenuePathHeaders } from "./venue-api-headers";

export type NotificationRow = {
  id: string;
  type: string;
  section: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type NotificationStatus = "all" | "unread" | "read" | "archived";

export type NotificationQuery = {
  from?: string;
  to?: string;
  section?: string;
  status?: NotificationStatus;
  take?: number;
  skip?: number;
};

export type NotificationListResponse = {
  items: NotificationRow[];
  total: number;
  unreadCount: number;
  take: number;
  skip: number;
  sections: Record<string, number>;
  canDelete: boolean;
};

export function fetchNotifications(q: NotificationQuery = {}) {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.section) params.set("section", q.section);
  if (q.status) params.set("status", q.status);
  if (q.take) params.set("take", String(q.take));
  if (q.skip) params.set("skip", String(q.skip));
  const qs = params.toString();
  return api<NotificationListResponse>(
    `/notifications${qs ? `?${qs}` : ""}`,
  );
}

export function fetchRecentNotifications(since: string) {
  return api<{ items: NotificationRow[]; unreadCount: number }>(
    `/notifications/recent?since=${encodeURIComponent(since)}`,
  );
}

export function fetchNotificationUnreadCount() {
  return api<{ unreadCount: number }>("/notifications/unread-count");
}

export type ReservationNotificationBadges = {
  dining: number;
  gaming: number;
  events: number;
  total: number;
};

export function fetchReservationNotificationBadges() {
  return api<ReservationNotificationBadges>("/notifications/reservation-badges");
}

export function markReservationTabNotificationsRead(
  tab: "dining" | "schedule" | "events",
) {
  return api<{ updated: number }>("/notifications/reservation-tabs/read", {
    method: "PATCH",
    body: JSON.stringify({ tab }),
  });
}

export function fetchNotificationSections() {
  return api<{ sections: string[] }>("/notifications/sections");
}

export function markNotificationRead(id: string) {
  return api<NotificationRow>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markNotificationUnread(id: string) {
  return api<NotificationRow>(`/notifications/${id}/unread`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead() {
  return api<{ updated: number }>("/notifications/read-all", {
    method: "PATCH",
  });
}

export function archiveNotifications(body: {
  ids?: string[];
  allMatching?: boolean;
  from?: string;
  to?: string;
  section?: string;
  status?: "all" | "unread" | "read" | "archived";
}) {
  return api<{ updated: number }>("/notifications/archive", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function unarchiveNotifications(body: {
  ids?: string[];
  allMatching?: boolean;
  from?: string;
  to?: string;
  section?: string;
}) {
  return api<{ updated: number }>("/notifications/unarchive", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteNotifications(body: {
  ids?: string[];
  allMatching?: boolean;
  from?: string;
  to?: string;
  section?: string;
  status?: NotificationStatus;
}) {
  return api<{ deleted: number }>("/notifications", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export async function downloadNotificationsCsv(q: NotificationQuery = {}) {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.section) params.set("section", q.section);
  if (q.status) params.set("status", q.status);
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/notifications/export${qs ? `?${qs}` : ""}`,
    {
      credentials: "include",
      headers: getVenuePathHeaders(),
    },
  );
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const message =
      (body as { message?: string })?.message ?? `Export failed: ${res.status}`;
    throw new ApiError(String(message), res.status, body);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gospots-notifications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
