import { api, ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";
import type { MessageKey } from "./i18n";
import type { SeatingZone } from "./seating-zone";

export const EVENT_REQUEST_TYPES = [
  "TABLE",
  "GAMING",
  "BIRTHDAY",
  "MEETING",
  "PARTY",
  "CORPORATE",
  "OTHER",
] as const;

export const PRIVATE_EVENT_REQUEST_TYPES = [
  "BIRTHDAY",
  "MEETING",
  "PARTY",
  "CORPORATE",
  "OTHER",
] as const;

export type EventRequestType = (typeof EVENT_REQUEST_TYPES)[number];

export type EventRequestSource = "CLIENT_WEB" | "PHONE" | "STAFF";

export type EventRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "CANCELED";

export type EventRequest = {
  id: string;
  shopId: string;
  eventType: EventRequestType;
  source: EventRequestSource;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  preferredStartsAt: string;
  preferredEndsAt: string | null;
  zone: SeatingZone | null;
  floor: number | null;
  message: string | null;
  status: EventRequestStatus;
  staffResponseNote: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  seatingTableGroupId: string | null;
  resourceCategoryId: string | null;
  resourceCategory: {
    id: string;
    name: string;
    type: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated Prefer eventRequestTypeLabel(type, t) — English labels for legacy/public callers. */
export const EVENT_REQUEST_TYPE_LABELS: Record<EventRequestType, string> = {
  TABLE: "Table reservation",
  GAMING: "Gaming / activity",
  BIRTHDAY: "Birthday",
  MEETING: "Meeting",
  PARTY: "Party",
  CORPORATE: "Corporate / business",
  OTHER: "Other event",
};

/** @deprecated Prefer eventRequestSourceLabel(source, t) — English labels for legacy/public callers. */
export const EVENT_REQUEST_SOURCE_LABELS: Record<EventRequestSource, string> = {
  CLIENT_WEB: "Online form",
  PHONE: "Phone call",
  STAFF: "Logged by staff",
};

/** @deprecated Prefer eventRequestStatusLabel(status, t) — English labels for legacy/public callers. */
export const EVENT_REQUEST_STATUS_LABELS: Record<EventRequestStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELED: "Canceled",
};

const EVENT_REQUEST_TYPE_KEYS: Record<EventRequestType, MessageKey> = {
  TABLE: "eventRequests.type.TABLE",
  GAMING: "eventRequests.type.GAMING",
  BIRTHDAY: "eventRequests.type.BIRTHDAY",
  MEETING: "eventRequests.type.MEETING",
  PARTY: "eventRequests.type.PARTY",
  CORPORATE: "eventRequests.type.CORPORATE",
  OTHER: "eventRequests.type.OTHER",
};

const EVENT_REQUEST_SOURCE_KEYS: Record<EventRequestSource, MessageKey> = {
  CLIENT_WEB: "eventRequests.source.CLIENT_WEB",
  PHONE: "eventRequests.source.PHONE",
  STAFF: "eventRequests.source.STAFF",
};

const EVENT_REQUEST_STATUS_KEYS: Record<EventRequestStatus, MessageKey> = {
  PENDING: "eventRequests.status.PENDING",
  APPROVED: "eventRequests.status.APPROVED",
  DECLINED: "eventRequests.status.DECLINED",
  CANCELED: "eventRequests.status.CANCELED",
};

type EventRequestTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function eventRequestTypeLabel(
  type: EventRequestType,
  t?: EventRequestTranslate,
): string {
  if (t) return t(EVENT_REQUEST_TYPE_KEYS[type]);
  return EVENT_REQUEST_TYPE_LABELS[type];
}

export function eventRequestSourceLabel(
  source: EventRequestSource,
  t?: EventRequestTranslate,
): string {
  if (t) return t(EVENT_REQUEST_SOURCE_KEYS[source]);
  return EVENT_REQUEST_SOURCE_LABELS[source];
}

export function eventRequestStatusLabel(
  status: EventRequestStatus,
  t?: EventRequestTranslate,
): string {
  if (t) return t(EVENT_REQUEST_STATUS_KEYS[status]);
  return EVENT_REQUEST_STATUS_LABELS[status];
}

export function fetchEventRequests(params?: { status?: EventRequestStatus }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return api<{ requests: EventRequest[]; pendingCount: number }>(
    `/event-requests${qs ? `?${qs}` : ""}`,
  );
}

export function createStaffEventRequest(body: {
  eventType: EventRequestType;
  source?: EventRequestSource;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize: number;
  preferredStartsAt: string;
  preferredEndsAt?: string;
  zone?: SeatingZone;
  floor?: number;
  message?: string;
}) {
  return api<EventRequest>("/event-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reviewEventRequest(
  id: string,
  body: {
    action: "approve" | "decline";
    staffResponseNote?: string;
    createFloorBlock?: boolean;
    floorBlockLabel?: string;
    floor?: number;
  },
) {
  return api<EventRequest>(`/event-requests/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function cancelEventRequest(id: string) {
  return api<EventRequest>(`/event-requests/${id}/cancel`, {
    method: "PATCH",
  });
}

export async function submitPublicEventRequest(
  slug: string,
  body: {
    eventType: EventRequestType;
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    partySize: number;
    preferredStartsAt: string;
    preferredEndsAt?: string;
    zone?: SeatingZone;
    message?: string;
    resourceCategoryId?: string;
    privacyConsentAccepted: boolean;
    /** Optional; required only when API CAPTCHA_PROVIDER is enforced. */
    captchaToken?: string;
  },
) {
  const res = await fetch(
    `${getApiBaseUrl()}/public/venues/${encodeURIComponent(slug)}/event-requests`,
    {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message =
      (payload as { message?: string | string[] })?.message &&
      (Array.isArray((payload as { message?: string[] }).message)
        ? (payload as { message: string[] }).message.join(", ")
        : (payload as { message: string }).message) ||
      `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, payload);
  }
  return payload as {
    ok: boolean;
    message: string;
    id: string;
    guestToken?: string;
    statusPath?: string;
  };
}

export type PublicEventRequestStatus = {
  status: EventRequestStatus;
  eventType: EventRequestType;
  guestName: string;
  partySize: number;
  preferredStartsAt: string;
  preferredEndsAt: string | null;
  zone: SeatingZone | null;
  message: string | null;
  resourceCategory: {
    id: string;
    name: string;
    type: string;
  } | null;
  staffResponseNote: string | null;
  reviewedAt: string | null;
  venueName: string;
  venueSlug: string;
  canCancel: boolean;
};

export async function fetchPublicEventRequestStatus(slug: string, token: string) {
  const res = await fetch(
    `${getApiBaseUrl()}/public/venues/${encodeURIComponent(slug)}/event-requests/status/${encodeURIComponent(token)}`,
  );
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message =
      (payload as { message?: string | string[] })?.message &&
      (Array.isArray((payload as { message?: string[] }).message)
        ? (payload as { message: string[] }).message.join(", ")
        : (payload as { message: string }).message) ||
      `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, payload);
  }
  return payload as PublicEventRequestStatus;
}

export async function cancelPublicEventRequest(slug: string, token: string) {
  const res = await fetch(
    `${getApiBaseUrl()}/public/venues/${encodeURIComponent(slug)}/event-requests/status/${encodeURIComponent(token)}/cancel`,
    { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" } },
  );
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message =
      (payload as { message?: string | string[] })?.message &&
      (Array.isArray((payload as { message?: string[] }).message)
        ? (payload as { message: string[] }).message.join(", ")
        : (payload as { message: string }).message) ||
      `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, payload);
  }
  return payload as { ok: boolean; message: string; status?: EventRequestStatus };
}
