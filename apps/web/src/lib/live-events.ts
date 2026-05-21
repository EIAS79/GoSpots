/**
 * Lightweight pub/sub for cross-component "data changed" hints.
 *
 * Notification polling and explicit user actions can broadcast events; pages
 * subscribe to them to trigger an immediate refetch instead of waiting for
 * their next poll cycle.
 */

export type LiveEventSection =
  | "reservation"
  | "shop_orders"
  | "finance"
  | "operations"
  | "team"
  | "menu"
  | "subscription"
  | "system";

export type LiveEvent = {
  /** Notification section / domain that changed. */
  section: LiveEventSection | string;
  /** Optional resource id (booking id, order id, etc.). */
  resourceId?: string;
  /** Free-form payload for richer routing. */
  meta?: Record<string, unknown>;
};

const EVENT_NAME = "gospots:live";

export function publishLiveEvent(event: LiveEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
}

export function subscribeLiveEvent(
  handler: (event: LiveEvent) => void,
  filter?: (event: LiveEvent) => boolean,
) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<LiveEvent>;
    if (!ce.detail) return;
    if (filter && !filter(ce.detail)) return;
    handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
