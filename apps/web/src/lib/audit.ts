import type { MessageKey } from "@/lib/i18n";

/** @deprecated Prefer sectionLabel(section, t) — English labels for legacy callers. */
export const AUDIT_SECTIONS = [
  { value: "all", label: "All sections" },
  { value: "team", label: "Team & staff" },
  { value: "menu", label: "Menu" },
  { value: "reservation", label: "Reservations" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "reports", label: "Reports" },
  { value: "venue", label: "Venue settings" },
  { value: "gallery", label: "Gallery" },
  { value: "hours", label: "Hours & schedule" },
  { value: "notes", label: "Shift notes" },
  { value: "subscription", label: "Subscription" },
  { value: "system", label: "System" },
] as const;

/** @deprecated Prefer actionGroupLabel(action, t) — English labels for legacy callers. */
export const AUDIT_ACTION_GROUPS = [
  { value: "all", label: "All actions" },
  { value: "staff.", label: "Staff" },
  { value: "menu.", label: "Menu" },
  { value: "finance.", label: "Finance" },
  { value: "reports.", label: "Reports" },
  { value: "reservation.", label: "Reservations" },
] as const;

const AUDIT_SECTION_KEYS: Record<string, MessageKey> = {
  all: "auditPage.section.all",
  team: "auditPage.section.team",
  menu: "auditPage.section.menu",
  reservation: "auditPage.section.reservation",
  operations: "auditPage.section.operations",
  finance: "auditPage.section.finance",
  reports: "auditPage.section.reports",
  venue: "auditPage.section.venue",
  gallery: "auditPage.section.gallery",
  hours: "auditPage.section.hours",
  notes: "auditPage.section.notes",
  subscription: "auditPage.section.subscription",
  system: "auditPage.section.system",
};

const AUDIT_ACTION_KEYS: Record<string, MessageKey> = {
  all: "auditPage.action.all",
  "staff.": "auditPage.action.staff",
  "menu.": "auditPage.action.menu",
  "finance.": "auditPage.action.finance",
  "reports.": "auditPage.action.reports",
  "reservation.": "auditPage.action.reservation",
};

type AuditTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function sectionLabel(section: string, t?: AuditTranslate) {
  const key = AUDIT_SECTION_KEYS[section];
  if (key && t) return t(key);
  return AUDIT_SECTIONS.find((s) => s.value === section)?.label ?? section;
}

export function actionGroupLabel(action: string, t?: AuditTranslate) {
  const key = AUDIT_ACTION_KEYS[action];
  if (key && t) return t(key);
  return (
    AUDIT_ACTION_GROUPS.find((a) => a.value === action)?.label ?? action
  );
}
