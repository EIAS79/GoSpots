import type { ReservationStatus } from "@/lib/reservations-client";
import {
  DINING_BOOKING_PHASE_LABELS,
  resolveDiningBookingPhase,
  type DiningBookingPhase,
} from "@/lib/booking-time";

export type GuestDiningPhase = DiningBookingPhase;

export const GUEST_DINING_PHASE_LABELS = DINING_BOOKING_PHASE_LABELS;

export function resolveGuestDiningPhase(
  status: ReservationStatus | string,
  startsAt: string | Date,
  endsAt: string | Date,
  nowMs: number = Date.now(),
): GuestDiningPhase {
  return resolveDiningBookingPhase(status, startsAt, endsAt, nowMs);
}
