import { ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";
import type { DaySchedule } from "./reservations-client";

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
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
  return payload as T;
}

export function fetchPublicDiningSchedule(
  slug: string,
  params: { date: string; categoryId?: string },
) {
  const q = new URLSearchParams({ date: params.date });
  if (params.categoryId) q.set("categoryId", params.categoryId);
  return publicFetch<DaySchedule>(
    `/public/venues/${encodeURIComponent(slug)}/dining/schedule?${q}`,
  );
}

export function submitPublicDiningReservation(
  slug: string,
  body: {
    resourceId: string;
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    partySize: number;
    startsAt: string;
    endsAt: string;
    notes?: string;
  },
) {
  return publicFetch<{
    message: string;
    statusPath?: string;
    id: string;
    guestToken?: string;
  }>(`/public/venues/${encodeURIComponent(slug)}/dining/reservations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PublicDiningReservationStatus = {
  status: string;
  guestName: string;
  startsAt: string;
  endsAt: string;
  partySize: number;
  notes: string | null;
  unitName: string | null;
  categoryName: string | null;
  categoryType: string | null;
  venueName: string;
  venueSlug: string;
  canCancel: boolean;
  isDining?: boolean;
};

export function fetchPublicDiningReservationStatus(slug: string, token: string) {
  return publicFetch<PublicDiningReservationStatus>(
    `/public/venues/${encodeURIComponent(slug)}/dining/reservations/status/${encodeURIComponent(token)}`,
  );
}

export function cancelPublicDiningReservation(slug: string, token: string) {
  return publicFetch<{ ok: boolean; message: string; status?: string }>(
    `/public/venues/${encodeURIComponent(slug)}/dining/reservations/status/${encodeURIComponent(token)}/cancel`,
    { method: "POST" },
  );
}
