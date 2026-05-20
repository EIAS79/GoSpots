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
};

export function resolveVenuePathFromMemberships(
  memberships: {
    isActive?: boolean;
    role: string;
    shop: VenueShopRef;
  }[],
): string | null {
  const active = memberships.filter((m) => m.isActive !== false);
  const primary = active.find((m) => m.role === "OWNER") ?? active[0];
  if (!primary?.shop.dashboardKey) return null;
  return buildDashboardPath(primary.shop.slug, primary.shop.dashboardKey);
}
