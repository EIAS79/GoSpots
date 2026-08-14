/**
 * Permission keys are dot-namespaced.
 * `*` is a wildcard that grants every permission (Owner default).
 */
export const PERMISSIONS = {
  VENUE_READ: 'venue.read',
  VENUE_WRITE: 'venue.write',
  SHOP_MANAGE: 'shop.manage',
  MENU_READ: 'menu.read',
  MENU_WRITE: 'menu.write',
  RESOURCE_READ: 'resource.read',
  RESOURCE_WRITE: 'resource.write',
  SESSION_READ: 'session.read',
  SESSION_WRITE: 'session.write',
  SESSION_CANCEL: 'session.cancel',
  ORDER_READ: 'order.read',
  ORDER_WRITE: 'order.write',
  ORDER_VOID_AFTER_SEND: 'order.void_after_send',
  RESERVATION_READ: 'reservation.read',
  RESERVATION_WRITE: 'reservation.write',
  TRANSACTION_READ: 'transaction.read',
  TRANSACTION_WRITE: 'transaction.write',
  CHECKOUT_READ: 'checkout.read',
  CHECKOUT_WRITE: 'checkout.write',
  CHECKOUT_REOPEN: 'checkout.reopen',
  PAYMENT_READ: 'payment.read',
  PAYMENT_WRITE: 'payment.write',
  REFUND_READ: 'refund.read',
  REFUND_EXECUTE: 'refund.execute',
  CASH_OPEN: 'cash.open',
  CASH_MOVEMENT: 'cash.movement',
  CASH_CLOSE: 'cash.close',
  CASH_VIEW_EXPECTED: 'cash.view_expected',
  CASH_APPROVE_VARIANCE: 'cash.approve_variance',
  CASH_PAID_OUT: 'cash.paid_out',
  DAY_REOPEN: 'day.reopen',
  PRICE_OVERRIDE: 'price.override',
  DISCOUNT_MANUAL: 'discount.manual',
  COMP_APPLY: 'comp.apply',
  INVOICE_READ: 'invoice.read',
  INVOICE_WRITE: 'invoice.write',
  FISCAL_READ: 'fiscal.read',
  FISCAL_WRITE: 'fiscal.write',
  FISCAL_RETRY: 'fiscal.retry',
  FISCAL_OVERRIDE: 'fiscal.override',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',
  INVENTORY_CORRECTION: 'inventory.correction',
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_WRITE: 'customer.write',
  MEMBERSHIP_READ: 'membership.read',
  MEMBERSHIP_WRITE: 'membership.write',
  MEMBERSHIP_BALANCE_CORRECTION: 'membership.balance_correction',
  TICKET_READ: 'ticket.read',
  TICKET_WRITE: 'ticket.write',
  REPORT_READ: 'report.read',
  INTEGRATION_READ: 'integration.read',
  INTEGRATION_WRITE: 'integration.write',
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
  ADMIN_ACCESS: 'admin.access',
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
  TICKETING_MANAGE: 'ticketing.manage',
  AUTOMATION_MANAGE: 'automation.manage',
  AI_INSIGHTS_READ: 'ai_insights.read',
  RELIABILITY_READ: 'reliability.read',
  SUBSCRIPTION_MANAGE: 'subscription.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const HIGH_RISK_PERMISSIONS = [
  PERMISSIONS.PRICE_OVERRIDE,
  PERMISSIONS.DISCOUNT_MANUAL,
  PERMISSIONS.COMP_APPLY,
  PERMISSIONS.ORDER_VOID_AFTER_SEND,
  PERMISSIONS.REFUND_EXECUTE,
  PERMISSIONS.CASH_PAID_OUT,
  PERMISSIONS.CHECKOUT_REOPEN,
  PERMISSIONS.DAY_REOPEN,
  PERMISSIONS.INVENTORY_CORRECTION,
  PERMISSIONS.MEMBERSHIP_BALANCE_CORRECTION,
  PERMISSIONS.FISCAL_RETRY,
  PERMISSIONS.FISCAL_OVERRIDE,
] as const satisfies readonly PermissionKey[];

export const VENUE_STAFF_ROLES = [
  'MANAGER',
  'STAFF',
  'SUPERVISOR',
  'CASHIER',
  'SERVER',
  'KITCHEN',
  'INVENTORY',
  'VIEWER',
] as const;

export type VenueStaffRole = (typeof VENUE_STAFF_ROLES)[number];

/** Machine-readable role templates. Persisted permission rows remain authoritative. */
export const ROLE_PERMISSION_TEMPLATES: Record<VenueStaffRole, readonly PermissionKey[]> = {
  MANAGER: [], // resolved from MANAGER_CORE_PERMISSIONS below
  STAFF: [],
  SUPERVISOR: [
    PERMISSIONS.VENUE_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.RESOURCE_WRITE,
    PERMISSIONS.SESSION_READ,
    PERMISSIONS.SESSION_WRITE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_WRITE,
    PERMISSIONS.CHECKOUT_READ,
    PERMISSIONS.CHECKOUT_WRITE,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_WRITE,
    PERMISSIONS.RESERVATION_READ,
    PERMISSIONS.RESERVATION_WRITE,
    PERMISSIONS.CASH_OPEN,
    PERMISSIONS.CASH_CLOSE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.STAFF_READ,
  ],
  CASHIER: [
    PERMISSIONS.VENUE_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.SESSION_READ,
    PERMISSIONS.SESSION_WRITE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_WRITE,
    PERMISSIONS.CHECKOUT_READ,
    PERMISSIONS.CHECKOUT_WRITE,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_WRITE,
    PERMISSIONS.CASH_OPEN,
    PERMISSIONS.CASH_CLOSE,
  ],
  SERVER: [
    PERMISSIONS.VENUE_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.SESSION_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_WRITE,
    PERMISSIONS.CHECKOUT_READ,
    PERMISSIONS.RESERVATION_READ,
  ],
  KITCHEN: [PERMISSIONS.VENUE_READ, PERMISSIONS.ORDER_READ, PERMISSIONS.ORDER_WRITE],
  INVENTORY: [
    PERMISSIONS.VENUE_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.MENU_READ,
  ],
  VIEWER: [
    PERMISSIONS.VENUE_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.SESSION_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.RESERVATION_READ,
    PERMISSIONS.REPORT_READ,
  ],
};

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

export function resolveRoleDefaultPermissions(role: string): PermissionKey[] {
  if (role === 'OWNER') return [];
  if (role === 'MANAGER') return [...MANAGER_CORE_PERMISSIONS];
  if (role in ROLE_PERMISSION_TEMPLATES) {
    return [...ROLE_PERMISSION_TEMPLATES[role as VenueStaffRole]];
  }
  return [];
}

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

const KNOWN_PERMISSIONS = new Set<string>(Object.values(PERMISSIONS));

/**
 * Rows-primary permission resolve.
 * When `permissionRows` is provided (including `[]`), join rows are SoT.
 * CSV is only a fallback for callers that never loaded rows (tests / legacy).
 */
export function resolvePermissionSet(input: {
  permissionsCsv?: string | null;
  permissionRows?: { permission: string }[] | null;
}): Set<string> {
  if (input.permissionRows != null) {
    const set = new Set<string>();
    for (const row of input.permissionRows) {
      const p = row.permission?.trim();
      if (p) set.add(p);
    }
    return set;
  }
  return parsePermissions(input.permissionsCsv ?? '');
}

/** Effective CSV for JWT / legacy API callers (computed; not a DB column). */
export function permissionsToEffectiveCsv(input: {
  permissionsCsv?: string | null;
  permissionRows?: { permission: string }[] | null;
}): string {
  const set = resolvePermissionSet(input);
  if (set.has('*')) return '*';
  return [...set].join(',');
}

export function hasPermissionFromSources(
  input: {
    permissionsCsv?: string | null;
    permissionRows?: { permission: string }[] | null;
  },
  required: PermissionKey,
): boolean {
  const set = resolvePermissionSet(input);
  return set.has('*') || set.has(required);
}

/** Reject unknown permission keys (typos). `*` allowed. */
export function assertKnownPermissions(perms: string[]): string[] {
  const out: string[] = [];
  for (const raw of perms) {
    const p = raw.trim();
    if (!p) continue;
    if (p === '*') {
      out.push('*');
      continue;
    }
    if (!KNOWN_PERMISSIONS.has(p)) {
      throw new Error(`Unknown permission: ${p}`);
    }
    out.push(p);
  }
  return out;
}

/** Normalize CSV or token list into permission tokens for row writes. */
export function permissionTokensFromInput(
  permissions: string | string[] | null | undefined,
): string[] {
  if (permissions == null) return [];
  if (Array.isArray(permissions)) {
    return [...new Set(permissions.map((p) => p.trim()).filter(Boolean))];
  }
  return [...parsePermissions(permissions)];
}

/**
 * Replace MembershipPermission rows (source of truth).
 * Accepts CSV string or token array — CSV is parse-only, not persisted.
 */
export async function replaceMembershipPermissionRows(
  db: {
    membershipPermission: {
      deleteMany: (args: { where: { membershipId: string } }) => Promise<unknown>;
      createMany: (args: {
        data: { membershipId: string; permission: string }[];
        skipDuplicates?: boolean;
      }) => Promise<unknown>;
    };
  },
  membershipId: string,
  permissions: string | string[] | null | undefined,
): Promise<void> {
  const tokens = permissionTokensFromInput(permissions);
  await db.membershipPermission.deleteMany({ where: { membershipId } });
  if (!tokens.length) return;
  await db.membershipPermission.createMany({
    data: tokens.map((permission) => ({ membershipId, permission })),
    skipDuplicates: true,
  });
}

/** @deprecated Prefer replaceMembershipPermissionRows — alias kept for call-site churn. */
export const syncMembershipPermissionRows = replaceMembershipPermissionRows;

export {
  FEATURE_MATRIX,
  tierHasFeature,
  ALL_FEATURE_KEYS,
} from './subscription-tier';
