import type { AuthUser } from "./auth-client";

/** Must match API `DASHBOARD_PATH_SEP`. */
export const DASHBOARD_PATH_SEP = "--";

export function buildDashboardPath(slug: string, dashboardKey: string): string {
  return `${slug}${DASHBOARD_PATH_SEP}${dashboardKey}`;
}

/** Strip secret key from a `slug--key` path; slug-only passes through. */
export function toPublicVenuePath(venuePath: string): string {
  const parsed = parseDashboardPath(venuePath);
  return parsed?.slug ?? venuePath;
}

export function parseDashboardPath(
  venuePath: string,
): { slug: string; dashboardKey: string } | null {
  const idx = venuePath.indexOf(DASHBOARD_PATH_SEP);
  if (idx <= 0) return null;
  const slug = venuePath.slice(0, idx);
  const dashboardKey = venuePath.slice(idx + DASHBOARD_PATH_SEP.length);
  if (!slug || !dashboardKey) return null;
  return { slug, dashboardKey };
}

/** True when URL still embeds the dashboard key (legacy / shared links). */
export function venuePathHasSecret(venuePath: string): boolean {
  return parseDashboardPath(venuePath) !== null;
}

export function dashboardBase(path: string): string {
  return `/dashboard/${toPublicVenuePath(path)}`;
}

export function dashboardHref(venuePath: string, segment = ""): string {
  const base = dashboardBase(venuePath);
  if (!segment || segment === "/") return base;
  return `${base}${segment.startsWith("/") ? segment : `/${segment}`}`;
}

/**
 * Rewrite `/dashboard/slug--key/...` → `/dashboard/slug/...` (pathname only).
 * Leaves non-dashboard paths unchanged.
 */
export function toPublicDashboardPathname(pathname: string): string {
  const prefix = "/dashboard/";
  if (!pathname.startsWith(prefix)) return pathname;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  const rawSegment = slash < 0 ? rest : rest.slice(0, slash);
  const suffix = slash < 0 ? "" : rest.slice(slash);
  let segment = rawSegment;
  try {
    segment = decodeURIComponent(rawSegment);
  } catch {
    /* keep raw */
  }
  return `${prefix}${toPublicVenuePath(segment)}${suffix}`;
}

export type VenueShopRef = {
  slug: string;
  name?: string;
};

export type VenueMembership = AuthUser["memberships"][number];

/** Public venue slug for routing / API `x-venue-path` (membership-only bind). */
export function membershipVenuePath(
  membership: Pick<VenueMembership, "shop">,
): string {
  return membership.shop.slug;
}

/** Public URL segment (slug only — no key in the address bar). */
export function membershipPublicPath(
  membership: Pick<VenueMembership, "shop">,
): string {
  return membership.shop.slug;
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

function venuePathsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return toPublicVenuePath(a) === toPublicVenuePath(b);
}

export function sortMemberships(
  memberships: VenueMembership[],
  currentVenuePath?: string | null,
): VenueMembership[] {
  return [...listActiveMemberships(memberships)].sort((a, b) => {
    if (currentVenuePath) {
      const aCurrent = venuePathsMatch(
        membershipPublicPath(a),
        currentVenuePath,
      );
      const bCurrent = venuePathsMatch(
        membershipPublicPath(b),
        currentVenuePath,
      );
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
  const publicSlug = toPublicVenuePath(venuePath);
  return (
    listActiveMemberships(memberships).find(
      (m) => m.shop.slug === publicSlug,
    ) ?? null
  );
}

export function hasMembershipForVenuePath(
  memberships: VenueMembership[],
  venuePath: string,
): boolean {
  return findMembershipForVenuePath(memberships, venuePath) !== null;
}

/**
 * Resolve slug for API `x-venue-path` from a public or legacy secret URL path.
 * (Name kept for call-site compatibility — bind is membership-only, not a secret.)
 */
export function resolveSecretVenuePath(
  memberships: VenueMembership[],
  venuePath: string,
): string | null {
  const m = findMembershipForVenuePath(memberships, venuePath);
  return m ? membershipPublicPath(m) : null;
}

/** Prefer public slug for browser navigation / session bind. */
export function resolveVenuePathFromMemberships(
  memberships: VenueMembership[],
): string | null {
  const sorted = sortMemberships(memberships);
  const owner = sorted.find((m) => m.role === "OWNER");
  const primary = owner ?? sorted[0];
  if (!primary?.shop.slug) return null;
  return membershipPublicPath(primary);
}

/** Keep the current dashboard section when switching venues. */
export function switchVenuePreserveRoute(
  pathname: string,
  currentVenuePath: string,
  nextVenuePath: string,
): string {
  const currentPublic = toPublicVenuePath(currentVenuePath);
  const nextPublic = toPublicVenuePath(nextVenuePath);
  const prefix = dashboardBase(currentPublic);
  const suffix = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : "";
  return dashboardHref(nextPublic, suffix);
}
