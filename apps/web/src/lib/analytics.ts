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
