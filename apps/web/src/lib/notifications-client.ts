import { api } from "./api";

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

export function fetchNotifications(q: NotificationQuery = {}) {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.section) params.set("section", q.section);
  if (q.status) params.set("status", q.status);
  if (q.take) params.set("take", String(q.take));
  if (q.skip) params.set("skip", String(q.skip));
  const qs = params.toString();
  return api<{
    items: NotificationRow[];
    total: number;
    unreadCount: number;
    take: number;
    skip: number;
    sections: Record<string, number>;
  }>(`/notifications${qs ? `?${qs}` : ""}`);
}

export function fetchRecentNotifications(since: string) {
  return api<{ items: NotificationRow[]; unreadCount: number }>(
    `/notifications/recent?since=${encodeURIComponent(since)}`,
  );
}

export function fetchNotificationUnreadCount() {
  return api<{ unreadCount: number }>("/notifications/unread-count");
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
  status?: "all" | "unread" | "read";
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
