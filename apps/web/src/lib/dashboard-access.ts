export type AccessToggle = {
  perm: string;
  label: string;
  hint?: string;
};

export type DashboardAccessGroup = {
  id: string;
  label: string;
  description: string;
  toggles: AccessToggle[];
};

/** Dashboard areas the owner can grant or revoke per employee. */
export const DASHBOARD_ACCESS_GROUPS: DashboardAccessGroup[] = [
  {
    id: "reservations",
    label: "Reservations",
    description: "Dining bookings, event requests, and game bookings.",
    toggles: [
      { perm: "reservation.read", label: "View reservations" },
      {
        perm: "reservation.write",
        label: "Create & edit bookings",
        hint: "Create and edit booking details — not prices.",
      },
    ],
  },
  {
    id: "sales",
    label: "Orders, play billing & finance",
    description: "Kitchen tickets, game charges, revenue, and reports.",
    toggles: [
      { perm: "transaction.read", label: "View sales & orders" },
      {
        perm: "transaction.write",
        label: "Record sales, manage orders & adjust play-billing",
        hint: "Includes adjusting play-billing amounts and charges.",
      },
    ],
  },
  {
    id: "menu",
    label: "Menu",
    description: "Food & drink items and daily stock.",
    toggles: [
      { perm: "menu.read", label: "View menu" },
      {
        perm: "menu.write",
        label: "Edit menu & item prices",
        hint: "Includes editing item prices.",
      },
    ],
  },
  {
    id: "gallery",
    label: "Gallery",
    description: "Venue photos on your public page.",
    toggles: [
      { perm: "gallery.read", label: "View gallery" },
      { perm: "gallery.write", label: "Edit gallery" },
    ],
  },
  {
    id: "gaming",
    label: "Gaming setup",
    description: "PCs, consoles, tables, lanes, and floor layout.",
    toggles: [
      { perm: "resource.read", label: "View games & units" },
      { perm: "resource.write", label: "Manage games & layout" },
    ],
  },
  {
    id: "hours",
    label: "Hours & schedule",
    description: "Weekly hours and special-date exceptions.",
    toggles: [
      { perm: "hours.read", label: "View hours" },
      { perm: "hours.write", label: "Edit hours" },
    ],
  },
  {
    id: "notes",
    label: "Shift notes",
    description: "Handoff reminders for the next person on duty.",
    toggles: [
      { perm: "notes.read", label: "View notes" },
      { perm: "notes.write", label: "Add & archive notes" },
    ],
  },
  {
    id: "settings",
    label: "Venue settings",
    description: "Profile, location, floors, and publish settings.",
    toggles: [{ perm: "shop.manage", label: "View & edit venue settings" }],
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "In-app alerts for bookings, team, and billing.",
    toggles: [{ perm: "notifications.read", label: "View notifications" }],
  },
  {
    id: "audit",
    label: "Audit log",
    description: "Who changed what across the dashboard.",
    toggles: [{ perm: "audit.read", label: "View audit log" }],
  },
  {
    id: "reviews",
    label: "Reviews",
    description: "Guest ratings and comments on your public venue page.",
    toggles: [
      { perm: "reviews.read", label: "View reviews" },
      { perm: "reviews.write", label: "Publish, hide, or delete reviews" },
    ],
  },
  {
    id: "messaging",
    label: "Guest messages",
    description: "Live chat with guests on your public venue page.",
    toggles: [
      { perm: "messaging.read", label: "View guest chats" },
      { perm: "messaging.write", label: "Reply, pause, end, or delete chats" },
    ],
  },
  {
    id: "team",
    label: "Employee accounts",
    description: "Team list and access control.",
    toggles: [
      { perm: "staff.read", label: "View team list" },
      {
        perm: "staff.write",
        label: "Edit roles & permissions",
        hint: "Trusted admins only",
      },
    ],
  },
];

export const FLOOR_STAFF_PRESET: string[] = [
  "resource.read",
  "reservation.read",
  "reservation.write",
  "transaction.read",
  "menu.read",
  "notifications.read",
  "notes.read",
  "notes.write",
  "reviews.read",
  "messaging.read",
];

export const KITCHEN_PRESET: string[] = [
  "menu.read",
  "transaction.read",
  "transaction.write",
  "notifications.read",
  "notes.read",
  "notes.write",
  "reviews.read",
];

/** Full ops for managers — everything assignable except audit + optional extras. */
export const MANAGER_CORE_PERMS: string[] = DASHBOARD_ACCESS_GROUPS.flatMap(
  (g) => g.toggles.map((t) => t.perm),
).filter(
  (p) =>
    p !== "audit.read" &&
    p !== "shop.manage" &&
    p !== "subscription.manage",
);

export const MANAGER_OPTIONAL = {
  venueSettings: "shop.manage",
  subscription: "subscription.manage",
} as const;

export function buildManagerPerms(opts: {
  venueSettings?: boolean;
  subscription?: boolean;
}): string[] {
  const next = [...MANAGER_CORE_PERMS];
  if (opts.venueSettings) next.push(MANAGER_OPTIONAL.venueSettings);
  if (opts.subscription) next.push(MANAGER_OPTIONAL.subscription);
  return next;
}

export function managerExtrasFromPerms(perms: string[]) {
  return {
    venueSettings: hasPermInList(perms, MANAGER_OPTIONAL.venueSettings),
    subscription: hasPermInList(perms, MANAGER_OPTIONAL.subscription),
  };
}

export function permsFromCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function hasPermInList(perms: string[], key: string) {
  return perms.includes("*") || perms.includes(key);
}

export function togglePerm(perms: string[], key: string, enabled: boolean) {
  const set = new Set(perms.filter((p) => p !== "*"));
  if (enabled) set.add(key);
  else set.delete(key);
  return [...set];
}

export function groupPerms(group: DashboardAccessGroup) {
  return group.toggles.map((t) => t.perm);
}

export function isGroupFullyEnabled(perms: string[], group: DashboardAccessGroup) {
  return group.toggles.every((t) => hasPermInList(perms, t.perm));
}

export function setGroupEnabled(
  perms: string[],
  group: DashboardAccessGroup,
  enabled: boolean,
) {
  let next = perms.filter((p) => p !== "*");
  for (const toggle of group.toggles) {
    next = togglePerm(next, toggle.perm, enabled);
  }
  return next;
}

export function filterAssignablePerms(
  perms: string[],
  assignable: string[],
) {
  const allowed = new Set(assignable);
  return perms.filter((p) => allowed.has(p));
}
