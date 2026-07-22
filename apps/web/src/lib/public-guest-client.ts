import { ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";
import {
  httpFailureMessage,
  networkUnreachableMessage,
} from "./api-error-message";

export type PublicVenueReview = {
  id: string;
  guestName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type PublicVenueReviewsResponse = {
  averageRating: number | null;
  reviewCount: number;
  reviews: PublicVenueReview[];
  reviewsMode?: "ENABLED" | "DISABLED" | "HIDDEN";
  canSubmit?: boolean;
  showReviews?: boolean;
};

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

export function fetchPublicVenueReviews(
  slug: string,
  opts: {
    take?: number;
    sort?: "date" | "rating";
    order?: "asc" | "desc";
  } = {},
) {
  const take = opts.take ?? 12;
  const q = new URLSearchParams({ take: String(take) });
  if (opts.sort) q.set("sort", opts.sort);
  if (opts.order) q.set("order", opts.order);
  return publicFetch<PublicVenueReviewsResponse>(
    `/public/venues/${encodeURIComponent(slug)}/reviews?${q}`,
  );
}

export function submitPublicVenueReview(
  slug: string,
  body: {
    guestName: string;
    guestEmail?: string;
    rating: number;
    comment?: string;
    privacyConsentAccepted: boolean;
    /** Optional; required only when API CAPTCHA_PROVIDER is enforced. */
    captchaToken?: string;
  },
) {
  return publicFetch<{ ok: boolean; message: string; id: string }>(
    `/public/venues/${encodeURIComponent(slug)}/reviews`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function submitPublicVenueContact(
  slug: string,
  body: {
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    subject?: string;
    message: string;
    privacyConsentAccepted: boolean;
    /** Optional; required only when API CAPTCHA_PROVIDER is enforced. */
    captchaToken?: string;
  },
) {
  return publicFetch<{ ok: boolean; message: string; id: string }>(
    `/public/venues/${encodeURIComponent(slug)}/contact`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
