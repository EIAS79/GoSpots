import { randomBytes } from 'crypto';
import { hashToken } from './security/token';

/** Separator between public slug and secret key (slug never contains `--`). */
export const DASHBOARD_PATH_SEP = '--';

export function generateDashboardKey(): string {
  return randomBytes(9).toString('base64url');
}

/** SHA-256 hex — same digest as guest/auth tokens (`hashToken`). */
export function hashDashboardKey(raw: string): string {
  return hashToken(raw.trim());
}

/**
 * Dual-write persist fields until plaintext DROP (Phase 3 expand).
 * Bind never looks up by key — membership + slug only.
 */
export function dashboardKeyPersistFields(raw: string): {
  dashboardKey: string;
  dashboardKeyHash: string;
} {
  return {
    dashboardKey: raw,
    dashboardKeyHash: hashDashboardKey(raw),
  };
}

export function issueDashboardKey(): {
  raw: string;
  hash: string;
} {
  const raw = generateDashboardKey();
  return { raw, hash: hashDashboardKey(raw) };
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

/** Strip secret key from a `slug--key` path; slug-only passes through. */
export function toPublicVenuePath(venuePath: string): string {
  const parsed = parseDashboardPath(venuePath);
  return parsed?.slug ?? venuePath;
}

/**
 * Venue path for `x-venue-path` / bind.
 * Phase 3: legacy `slug--key` is accepted but **always** resolves by slug only
 * (key is ignored for lookup — membership proves access).
 */
export type VenuePathRef = { mode: 'slug'; slug: string };

/**
 * Classify a venue path header/param.
 * Capability form still parses to extract the public slug; key is discarded.
 */
export function classifyVenuePath(venuePath: string): VenuePathRef | null {
  const trimmed = venuePath.trim();
  if (!trimmed) return null;
  const parsed = parseDashboardPath(trimmed);
  if (parsed) {
    return { mode: 'slug', slug: parsed.slug };
  }
  // Slug-only: no path separators (URL segment / header value).
  if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#')) {
    return null;
  }
  return { mode: 'slug', slug: trimmed };
}
