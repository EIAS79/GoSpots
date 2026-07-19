/**
 * Permission keys are dot-namespaced.
 * `*` is a wildcard that grants every permission (Owner default).
 */
export const PERMISSIONS = {
  SHOP_MANAGE: 'shop.manage',
  MENU_READ: 'menu.read',
  MENU_WRITE: 'menu.write',
  RESOURCE_READ: 'resource.read',
  RESOURCE_WRITE: 'resource.write',
  RESERVATION_READ: 'reservation.read',
  RESERVATION_WRITE: 'reservation.write',
  TRANSACTION_READ: 'transaction.read',
  TRANSACTION_WRITE: 'transaction.write',
  GALLERY_READ: 'gallery.read',
  GALLERY_WRITE: 'gallery.write',
  STAFF_READ: 'staff.read',
  STAFF_WRITE: 'staff.write',
  HOURS_READ: 'hours.read',
  HOURS_WRITE: 'hours.write',
  NOTES_READ: 'notes.read',
  NOTES_WRITE: 'notes.write',
  NOTIFICATIONS_READ: 'notifications.read',
  AUDIT_READ: 'audit.read',
  REVIEWS_READ: 'reviews.read',
  REVIEWS_WRITE: 'reviews.write',
  MESSAGING_READ: 'messaging.read',
  MESSAGING_WRITE: 'messaging.write',
  SUBSCRIPTION_MANAGE: 'subscription.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Core manager access: every dashboard permission except audit, venue
 * settings, and subscription. Those last two are optional owner grants.
 */
export const MANAGER_CORE_PERMISSIONS: PermissionKey[] = (
  Object.values(PERMISSIONS) as PermissionKey[]
).filter(
  (p) =>
    p !== PERMISSIONS.AUDIT_READ &&
    p !== PERMISSIONS.SHOP_MANAGE &&
    p !== PERMISSIONS.SUBSCRIPTION_MANAGE,
);

export const MANAGER_OPTIONAL_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.SHOP_MANAGE,
  PERMISSIONS.SUBSCRIPTION_MANAGE,
];

/** Build manager CSV from optional extras. Never includes audit.read. */
export function resolveManagerPermissions(extras?: string[]): string {
  const set = new Set<string>(MANAGER_CORE_PERMISSIONS);
  const incoming = new Set((extras ?? []).map((p) => p.trim()).filter(Boolean));
  for (const opt of MANAGER_OPTIONAL_PERMISSIONS) {
    if (incoming.has(opt)) set.add(opt);
  }
  return [...set].join(',');
}

export function parsePermissions(csv: string): Set<string> {
  return new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function hasPermission(csv: string, required: PermissionKey): boolean {
  const set = parsePermissions(csv);
  return set.has('*') || set.has(required);
}

export {
  FEATURE_MATRIX,
  tierHasFeature,
  ALL_FEATURE_KEYS,
} from './subscription-tier';
