import { NextResponse, type NextRequest } from "next/server";

/** Must match `DASHBOARD_PATH_SEP` in venue-dashboard / API dashboard-path. */
const DASHBOARD_PATH_SEP = "--";

/**
 * Legacy/shared `/dashboard/slug--key/...` links → slug-only Location (no key leak).
 * VenueGate binds with public slug in sessionStorage (`x-venue-path`).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/dashboard/")) {
    return NextResponse.next();
  }

  const rest = pathname.slice("/dashboard/".length);
  if (!rest) return NextResponse.next();

  const slash = rest.indexOf("/");
  const rawSegment = slash < 0 ? rest : rest.slice(0, slash);
  const suffix = slash < 0 ? "" : rest.slice(slash);

  let segment = rawSegment;
  try {
    segment = decodeURIComponent(rawSegment);
  } catch {
    /* keep raw */
  }

  const idx = segment.indexOf(DASHBOARD_PATH_SEP);
  if (idx <= 0) return NextResponse.next();

  const slug = segment.slice(0, idx);
  const dashboardKey = segment.slice(idx + DASHBOARD_PATH_SEP.length);
  if (!slug || !dashboardKey) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/dashboard/${slug}${suffix}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
