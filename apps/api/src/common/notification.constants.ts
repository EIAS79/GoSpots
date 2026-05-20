/** Sections for filtering in-app notifications */
export const NOTIFICATION_SECTIONS = [
  "system",
  "subscription",
  "reservation",
  "operations",
  "team",
  "billing",
] as const;

export type NotificationSection = (typeof NOTIFICATION_SECTIONS)[number];

export const NOTIFICATION_SECTION_LABELS: Record<NotificationSection, string> =
  {
    system: "System",
    subscription: "Subscription & trial",
    reservation: "Reservations & bookings",
    operations: "Tables & operations",
    team: "Staff & admin",
    billing: "Billing",
  };
