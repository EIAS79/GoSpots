import { trackEvent } from "./analytics";
import { ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";
import {
  apiErrorFromResponse,
  networkUnreachableMessage,
} from "./api-error-message";
import type { DaySchedule } from "./reservations-client";

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
    const { message, code } = apiErrorFromResponse(res.status, payload);
    throw new ApiError(message, res.status, payload, code);
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

export async function submitPublicDiningReservation(
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
    privacyConsentAccepted: boolean;
    /** Optional; required only when API CAPTCHA_PROVIDER is enforced. */
    captchaToken?: string;
  },
) {
  trackEvent({
    event: "begin_booking",
    venue_slug: slug,
    booking_kind: "dining",
    resource_id: body.resourceId,
    party_size: body.partySize,
    has_phone: Boolean(body.guestPhone),
  });

  const result = await publicFetch<{
    message: string;
    statusPath?: string;
    id: string;
    guestToken?: string;
    emailSent?: boolean;
  }>(`/public/venues/${encodeURIComponent(slug)}/dining/reservations`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  trackEvent({
    event: "booking_complete",
    venue_slug: slug,
    booking_kind: "dining",
    reservation_id: result.id,
    resource_id: body.resourceId,
    party_size: body.partySize,
    email_sent: result.emailSent,
  });

  return result;
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
