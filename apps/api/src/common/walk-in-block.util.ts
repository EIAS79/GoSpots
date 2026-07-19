import type { PlaySession } from '@prisma/client';

/** When an active walk-in blocks a unit until this time. */
export function walkInEffectiveEnd(session: {
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
}): Date {
  if (session.endedAt) return session.endedAt;
  if (session.durationMinutes != null && session.durationMinutes > 0) {
    return new Date(
      session.startedAt.getTime() + session.durationMinutes * 60_000,
    );
  }
  return new Date(session.startedAt.getTime() + 24 * 60 * 60_000);
}

export function isWalkInBlockingAt(
  session: {
    startedAt: Date;
    endedAt: Date | null;
    durationMinutes: number | null;
    status: string;
  },
  at: Date,
): boolean {
  if (session.status !== 'ACTIVE') return false;
  const end = walkInEffectiveEnd(session);
  return session.startedAt <= at && end > at;
}

export function walkInToScheduleBooking(session: PlaySession) {
  const endsAt = walkInEffectiveEnd(session);
  return {
    id: `walkin:${session.id}`,
    guestName: session.label?.trim() || 'Walk-in',
    guestEmail: null as string | null,
    guestPhone: null as string | null,
    partySize: session.playerCount,
    startsAt: session.startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'CHECKED_IN' as const,
    notes: session.note,
    staffAlert: false,
    isWalkIn: true,
  };
}
