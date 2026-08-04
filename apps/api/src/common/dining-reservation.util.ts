export const DEFAULT_DINING_NO_SHOW_MINUTES = 30;
export const DEFAULT_NO_SHOW_MINUTES = DEFAULT_DINING_NO_SHOW_MINUTES;

export function parseNoShowMinutes(offeringConfig: unknown): number {
  if (offeringConfig && typeof offeringConfig === 'object') {
    const raw = (offeringConfig as { noShowMinutes?: unknown }).noShowMinutes;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    if (n >= 5 && n <= 180) return Math.floor(n);
  }
  return DEFAULT_NO_SHOW_MINUTES;
}

/** @deprecated use parseNoShowMinutes */
export const parseDiningNoShowMinutes = parseNoShowMinutes;

/** Hold window ends if guest does not arrive (no-show grace). */
export function holdEndsAt(startsAt: Date, noShowMinutes: number): Date {
  return new Date(startsAt.getTime() + noShowMinutes * 60_000);
}

/** @deprecated use holdEndsAt */
export const diningHoldEndsAt = holdEndsAt;

/** Open-ended session end — staff closes the unit when guests leave. */
export function sessionEndsAt(startsAt: Date): Date {
  const end = new Date(startsAt);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** @deprecated use sessionEndsAt */
export const diningSessionEndsAt = sessionEndsAt;

export function isDiningResourceType(type: string | null | undefined) {
  return type === 'DINING';
}

/**
 * Dining: arrival-only + no-show hold (endsAt is grace, not play length).
 * Gaming / bowling / etc.: guest/staff pick a real play end for overlap + pricing.
 */
export function usesHoldArrivalWindow(type: string | null | undefined) {
  return isDiningResourceType(type);
}

/** Reservations on a physical unit use arrival + check-in lifecycle. */
export function usesSessionLifecycle(type: string | null | undefined) {
  return type != null && type.length > 0;
}
