import type { AuthUser } from "./auth-client";

/** Must match API `DASHBOARD_PATH_SEP`. */
export const DASHBOARD_PATH_SEP = "--";

export function buildDashboardPath(slug: string, dashboardKey: string): string {
  return `${slug}${DASHBOARD_PATH_SEP}${dashboardKey}`;
}

export function dashboardBase(path: string): string {
  return `/dashboard/${path}`;
}

export function dashboardHref(venuePath: string, segment = ""): string {
  const base = dashboardBase(venuePath);
  if (!segment || segment === "/") return base;
  return `${base}${segment.startsWith("/") ? segment : `/${segment}`}`;
}

export type VenueShopRef = {
  slug: string;
  dashboardKey: string;
  name?: string;
};

export type VenueMembership = AuthUser["memberships"][number];

export function membershipVenuePath(
  membership: Pick<VenueMembership, "shop">,
): string {
  return buildDashboardPath(
    membership.shop.slug,
    membership.shop.dashboardKey,
  );
}

export function listActiveMemberships(
  memberships: VenueMembership[],
): VenueMembership[] {
  return memberships.filter((m) => m.isActive !== false);
}

const ROLE_RANK: Record<string, number> = {
  OWNER: 0,
  MANAGER: 1,
  STAFF: 2,
};

export function sortMemberships(
  memberships: VenueMembership[],
  currentVenuePath?: string | null,
): VenueMembership[] {
  return [...listActiveMemberships(memberships)].sort((a, b) => {
    if (currentVenuePath) {
      const aCurrent = membershipVenuePath(a) === currentVenuePath;
      const bCurrent = membershipVenuePath(b) === currentVenuePath;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    }
    const roleDiff =
      (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
    if (roleDiff !== 0) return roleDiff;
    return a.shop.name.localeCompare(b.shop.name, undefined, {
      sensitivity: "base",
    });
  });
}

export function findMembershipForVenuePath(
  memberships: VenueMembership[],
  venuePath: string,
): VenueMembership | null {
  return (
    listActiveMemberships(memberships).find(
      (m) => membershipVenuePath(m) === venuePath,
    ) ?? null
  );
}

export function hasMembershipForVenuePath(
  memberships: VenueMembership[],
  venuePath: string,
): boolean {
  return findMembershipForVenuePath(memberships, venuePath) !== null;
}

export function resolveVenuePathFromMemberships(
  memberships: VenueMembership[],
): string | null {
  const sorted = sortMemberships(memberships);
  const owner = sorted.find((m) => m.role === "OWNER");
  const primary = owner ?? sorted[0];
  if (!primary?.shop.dashboardKey) return null;
  return membershipVenuePath(primary);
}

/** Keep the current dashboard section when switching venues. */
export function switchVenuePreserveRoute(
  pathname: string,
  currentVenuePath: string,
  nextVenuePath: string,
): string {
  const prefix = dashboardBase(currentVenuePath);
  const suffix = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : "";
  return dashboardHref(nextVenuePath, suffix);
}
