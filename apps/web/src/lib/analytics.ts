export type AnalyticsEventName =
  | "view_venue"
  | "search_venues"
  | "contact_venue"
  | "begin_booking"
  | "booking_complete"
  | "venue_lead_start"
  | "venue_lead"
  | "sign_up"
  | "purchase";

export type AnalyticsEvent = {
  event: AnalyticsEventName;
  [key: string]: string | number | boolean | null | undefined;
};

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(payload: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);
}

/**
 * Emit an event at most once per browser for a stable business identifier.
 * Useful for payment confirmations that can be revisited/refreshed.
 */
export function trackEventOnce(key: string, payload: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  const storageKey = `gospots.analytics.once:${key}`;
  try {
    if (window.localStorage.getItem(storageKey) === "1") return;
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // Storage can be unavailable in privacy modes; still emit the event.
  }
  trackEvent(payload);
}

export function updateGoogleConsent(consent: {
  analytics: boolean;
  marketing: boolean;
}): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag(...args: unknown[]) {
    window.dataLayer?.push({ gtagArguments: args });
  };
  window.gtag("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
  });
}
