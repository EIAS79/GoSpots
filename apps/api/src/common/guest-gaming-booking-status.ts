import { ReservationStatus } from '@prisma/client';

export type GuestGamingPhase =
  | 'upcoming'
  | 'waiting'
  | 'in_use'
  | 'completed'
  | 'no_show'
  | 'canceled';

export const GUEST_GAMING_PHASE_LABELS: Record<GuestGamingPhase, string> = {
  upcoming: 'Upcoming',
  waiting: 'Waiting guest',
  in_use: 'In use',
  completed: 'Completed',
  no_show: 'No-show',
  canceled: 'Canceled',
};

export function resolveGuestGamingPhase(
  status: ReservationStatus | string,
  startsAt: Date,
  endsAt: Date,
  now: Date = new Date(),
): GuestGamingPhase {
  if (status === ReservationStatus.NO_SHOW) return 'no_show';
  if (status === ReservationStatus.CANCELED) return 'canceled';
  if (status === ReservationStatus.COMPLETED) return 'completed';
  if (status === ReservationStatus.CHECKED_IN) return 'in_use';

  const t = now.getTime();
  const start = startsAt.getTime();
  const end = endsAt.getTime();

  if (t < start) return 'upcoming';
  if (t >= start && t < end) return 'waiting';
  return 'no_show';
}
