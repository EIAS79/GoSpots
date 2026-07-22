import { api } from "./api";
import type { GuestChat, GuestChatMessage, GuestChatStatus } from "./guest-chat-client";

export type StaffGuestChatListItem = {
  id: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  status: GuestChatStatus;
  staffJoinedAt: string | null;
  lastGuestPingAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: GuestChatMessage | null;
};

export type GuestChatStatusCounts = {
  ALL: number;
  WAITING: number;
  OPEN: number;
  PAUSED: number;
  ENDED: number;
  notified: number;
};

export type GuestChatBadge = {
  waiting: number;
  notified: number;
  attention: number;
  contact: number;
  total: number;
};

export function fetchGuestChats(opts?: {
  status?: GuestChatStatus;
  take?: number;
  skip?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.take) params.set("take", String(opts.take));
  if (opts?.skip) params.set("skip", String(opts.skip));
  const qs = params.toString();
  return api<{
    total: number;
    waitingCount: number;
    notifiedCount: number;
    attentionCount: number;
    contactCount: number;
    counts: GuestChatStatusCounts;
    items: StaffGuestChatListItem[];
  }>(`/guest-chats${qs ? `?${qs}` : ""}`);
}

export function fetchGuestChatBadge() {
  return api<GuestChatBadge>("/guest-chats/badge");
}

export function fetchGuestChat(id: string) {
  return api<GuestChat>(`/guest-chats/${encodeURIComponent(id)}`);
}

export function joinGuestChat(id: string) {
  return api<GuestChat>(`/guest-chats/${encodeURIComponent(id)}/join`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function sendStaffGuestChatMessage(id: string, body: string) {
  return api<GuestChatMessage>(
    `/guest-chats/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

export function setGuestChatStatus(
  id: string,
  status: "OPEN" | "PAUSED" | "ENDED",
) {
  return api<GuestChat>(`/guest-chats/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteGuestChat(id: string) {
  return api<{ ok: boolean }>(`/guest-chats/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
