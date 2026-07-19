import { api } from "./api";

export type VenueReviewStatus = "PENDING" | "PUBLISHED" | "REJECTED";

export type StaffVenueReview = {
  id: string;
  guestName: string;
  guestEmail: string | null;
  rating: number;
  comment: string | null;
  status: VenueReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type StaffReviewsResponse = {
  total: number;
  averageRating: number | null;
  publishedCount: number;
  reviews: StaffVenueReview[];
};

export function fetchStaffReviews(params?: {
  status?: VenueReviewStatus;
  take?: number;
  skip?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.take != null) q.set("take", String(params.take));
  if (params?.skip != null) q.set("skip", String(params.skip));
  const qs = q.toString();
  return api<StaffReviewsResponse>(`/reviews${qs ? `?${qs}` : ""}`);
}

export function updateStaffReviewStatus(
  id: string,
  status: VenueReviewStatus,
) {
  return api<StaffVenueReview>(`/reviews/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteStaffReview(id: string) {
  return api<{ ok: boolean }>(`/reviews/${id}`, { method: "DELETE" });
}
