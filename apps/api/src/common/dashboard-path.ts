import { randomBytes } from 'crypto';

/** Separator between public slug and secret key (slug never contains `--`). */
export const DASHBOARD_PATH_SEP = '--';

export function generateDashboardKey(): string {
  return randomBytes(9).toString('base64url');
}

export function buildDashboardPath(slug: string, dashboardKey: string): string {
  return `${slug}${DASHBOARD_PATH_SEP}${dashboardKey}`;
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
