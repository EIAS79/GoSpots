export const AUDIT_SECTIONS = [
  { value: "all", label: "All sections" },
  { value: "team", label: "Team & staff" },
  { value: "menu", label: "Menu" },
  { value: "reservation", label: "Reservations" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "reports", label: "Reports" },
  { value: "venue", label: "Venue settings" },
  { value: "subscription", label: "Subscription" },
  { value: "system", label: "System" },
] as const;

export const AUDIT_ACTION_GROUPS = [
  { value: "all", label: "All actions" },
  { value: "staff.", label: "Staff" },
  { value: "menu.", label: "Menu" },
  { value: "finance.", label: "Finance" },
  { value: "reports.", label: "Reports" },
  { value: "reservation.", label: "Reservations" },
] as const;

export function sectionLabel(section: string) {
  return (
    AUDIT_SECTIONS.find((s) => s.value === section)?.label ?? section
  );
}
