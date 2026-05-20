/**
 * Permission keys are dot-namespaced.
 * `*` is a wildcard that grants every permission (Owner default).
 */
export const PERMISSIONS = {
  SHOP_MANAGE: "shop.manage",
  MENU_READ: "menu.read",
  MENU_WRITE: "menu.write",
  RESOURCE_READ: "resource.read",
  RESOURCE_WRITE: "resource.write",
  RESERVATION_READ: "reservation.read",
  RESERVATION_WRITE: "reservation.write",
  TRANSACTION_READ: "transaction.read",
  TRANSACTION_WRITE: "transaction.write",
  GALLERY_READ: "gallery.read",
  GALLERY_WRITE: "gallery.write",
  STAFF_READ: "staff.read",
  STAFF_WRITE: "staff.write",
  HOURS_WRITE: "hours.write",
  SUBSCRIPTION_MANAGE: "subscription.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function parsePermissions(csv: string): Set<string> {
  return new Set(csv.split(",").map((s) => s.trim()).filter(Boolean));
}

export function hasPermission(
  csv: string,
  required: PermissionKey,
): boolean {
  const set = parsePermissions(csv);
  return set.has("*") || set.has(required);
}

export {
  FEATURE_MATRIX,
  tierHasFeature,
  ALL_FEATURE_KEYS,
} from "./subscription-tier";
