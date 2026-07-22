import type { MessageKey } from "@/lib/i18n";

export const NOTIFICATION_SECTION_VALUES = [
  "all",
  "system",
  "subscription",
  "reservation",
  "operations",
  "team",
  "billing",
  "finance",
] as const;

export type NotificationSectionValue =
  (typeof NOTIFICATION_SECTION_VALUES)[number];

const SECTION_KEYS: Record<NotificationSectionValue, MessageKey> = {
  all: "notif.sectionAll",
  system: "notif.sectionSystem",
  subscription: "notif.sectionSubscription",
  reservation: "notif.sectionReservation",
  operations: "notif.sectionOperations",
  team: "notif.sectionTeam",
  billing: "notif.sectionBilling",
  finance: "notif.sectionFinance",
};

/** @deprecated Prefer sectionLabel(t, value) — English labels for legacy callers. */
export const NOTIFICATION_SECTIONS = [
  { value: "all", label: "All sections" },
  { value: "system", label: "System" },
  { value: "subscription", label: "Subscription & trial" },
  { value: "reservation", label: "Reservations & bookings" },
  { value: "operations", label: "Tables & operations" },
  { value: "team", label: "Staff & admin" },
  { value: "billing", label: "Billing" },
  { value: "finance", label: "Finance" },
] as const;

type NotifTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function sectionLabelKey(section: string): MessageKey | null {
  if (section in SECTION_KEYS) {
    return SECTION_KEYS[section as NotificationSectionValue];
  }
  return null;
}

export function sectionLabel(
  section: string,
  t?: NotifTranslate,
): string {
  const key = sectionLabelKey(section);
  if (key && t) return t(key);
  return (
    NOTIFICATION_SECTIONS.find((s) => s.value === section)?.label ?? section
  );
}
