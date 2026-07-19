import type { ReservationStatus } from "@/lib/reservations-client";
import {
  resolveSessionBookingPhase,
  SESSION_BOOKING_PHASE_LABELS,
  type SessionBookingPhase,
} from "@/lib/booking-time";

export type GuestGamingPhase = SessionBookingPhase;

export const GUEST_GAMING_PHASE_LABELS = SESSION_BOOKING_PHASE_LABELS;

export function resolveGuestGamingPhase(
  status: ReservationStatus | string,
  startsAt: string | Date,
  endsAt: string | Date,
  nowMs: number = Date.now(),
): GuestGamingPhase {
  return resolveSessionBookingPhase(status, startsAt, endsAt, nowMs);
}
