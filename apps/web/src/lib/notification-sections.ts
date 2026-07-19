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

export function sectionLabel(section: string) {
  return (
    NOTIFICATION_SECTIONS.find((s) => s.value === section)?.label ?? section
  );
}
