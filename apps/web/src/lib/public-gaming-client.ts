import { ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";
import {
  httpFailureMessage,
  networkUnreachableMessage,
} from "./api-error-message";
import type { DaySchedule } from "./reservations-client";
import type { ReservationStatus } from "./reservations-client";

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(networkUnreachableMessage(base), 0);
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message = httpFailureMessage(
      res.status,
      (payload as { message?: string | string[] } | null)?.message,
    );
    throw new ApiError(message, res.status, payload);
  }
  return payload as T;
}

export function fetchPublicGamingSchedule(
  slug: string,
  params: { date: string; categoryId?: string },
) {
  const q = new URLSearchParams({ date: params.date });
  if (params.categoryId) q.set("categoryId", params.categoryId);
  return publicFetch<DaySchedule>(
    `/public/venues/${encodeURIComponent(slug)}/gaming/schedule?${q}`,
  );
}

export function submitPublicGamingReservation(
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
    /** Required privacy notice acceptance. */
    privacyConsentAccepted: boolean;
    /** Optional; required only when API CAPTCHA_PROVIDER is enforced. */
    captchaToken?: string;
  },
) {
  return publicFetch<{
    ok: boolean;
    message: string;
    id: string;
    guestToken?: string;
    statusPath?: string;
    emailSent?: boolean;
  }>(`/public/venues/${encodeURIComponent(slug)}/gaming/reservations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PublicGamingReservationStatus = {
  status: ReservationStatus;
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
};

export function fetchPublicGamingReservationStatus(slug: string, token: string) {
  return publicFetch<PublicGamingReservationStatus>(
    `/public/venues/${encodeURIComponent(slug)}/gaming/reservations/status/${encodeURIComponent(token)}`,
  );
}

export function cancelPublicGamingReservation(slug: string, token: string) {
  return publicFetch<{ ok: boolean; message: string; status?: ReservationStatus }>(
    `/public/venues/${encodeURIComponent(slug)}/gaming/reservations/status/${encodeURIComponent(token)}/cancel`,
    { method: "POST" },
  );
}
