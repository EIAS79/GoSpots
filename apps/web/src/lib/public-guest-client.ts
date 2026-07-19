import { ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";

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
  },
) {
  return publicFetch<{ ok: boolean; message: string; id: string }>(
    `/public/venues/${encodeURIComponent(slug)}/contact`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
