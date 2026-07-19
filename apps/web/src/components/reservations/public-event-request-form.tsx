"use client";

import { PublicBookingRequestForm } from "@/components/reservations/public-booking-request-form";

/** @deprecated Use PublicBookingRequestForm with mode="EVENT" */
export function PublicEventRequestForm({ slug }: { slug: string }) {
  return <PublicBookingRequestForm slug={slug} mode="EVENT" />;
}
