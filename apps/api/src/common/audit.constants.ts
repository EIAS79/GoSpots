/** Dashboard areas for filtering audit entries */
export const AUDIT_SECTIONS = [
  'system',
  'team',
  'menu',
  'reservation',
  'operations',
  'finance',
  'reports',
  'venue',
  'gallery',
  'hours',
  'notes',
  'subscription',
] as const;

export type AuditSection = (typeof AUDIT_SECTIONS)[number];

export const AUDIT_SECTION_LABELS: Record<AuditSection, string> = {
  system: 'System',
  team: 'Team & staff',
  menu: 'Menu',
  reservation: 'Reservations',
  operations: 'Operations',
  finance: 'Finance',
  reports: 'Reports',
  venue: 'Venue settings',
  gallery: 'Gallery',
  hours: 'Hours & schedule',
  notes: 'Shift notes',
  subscription: 'Subscription',
};
