import type { Prisma } from '@prisma/client';

export type ReservationNotificationTab = 'dining' | 'schedule' | 'events';

export type GuestStatusKind = 'dining' | 'gaming' | 'event';

/**
 * Same-app relative href only: single leading `/`, no scheme, no
 * protocol-relative (`//…`), no backslashes, no `..` path segments.
 * Used for in-app notification links and guest status paths.
 */
export function isSafeAppRelativeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (trimmed.includes('\\') || trimmed.includes('\0')) return false;
  if (trimmed.includes('..')) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, 'http://app.local');
  } catch {
    return false;
  }
  // Absolute / protocol-relative inputs change origin away from the base.
  if (parsed.origin !== 'http://app.local') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.pathname.split('/').includes('..')) return false;
  return true;
}

/** Returns a safe relative path or `fallback` (default `/sessions`). */
export function sanitizeAppRelativeHref(
  href: string | null | undefined,
  fallback = '/sessions',
): string {
  if (href == null || typeof href !== 'string') return fallback;
  const trimmed = href.trim();
  if (!trimmed) return fallback;
  return isSafeAppRelativeHref(trimmed) ? trimmed : fallback;
}

/**
 * Join WEB_APP_URL + relative path. Returns null if path is not a safe
 * same-app relative href (blocks open redirects in email CTAs).
 */
export function absoluteAppUrl(
  webBase: string,
  path: string | null | undefined,
): string | null {
  if (path == null) return null;
  const safe = sanitizeAppRelativeHref(path, '');
  if (!safe) return null;
  const base = webBase.trim().replace(/\/$/, '');
  if (!base) return null;
  return `${base}${safe}`;
}

/** Guest status / cancel link path — slug must come from DB, never request body. */
export function guestVenueStatusPath(
  venueSlug: string,
  token: string,
  kind: GuestStatusKind,
): string {
  const slug = venueSlug.trim();
  const raw = token.trim();
  if (!slug || !raw) {
    return sanitizeAppRelativeHref('/', '/');
  }
  // Reject slug/token that would break out of a single path segment.
  if (
    slug.includes('/') ||
    slug.includes('\\') ||
    raw.includes('/') ||
    raw.includes('\\') ||
    slug.includes('..') ||
    raw.includes('..')
  ) {
    return sanitizeAppRelativeHref('/', '/');
  }
  const seg =
    kind === 'dining'
      ? 'dining-status'
      : kind === 'event'
        ? 'event-status'
        : 'gaming-status';
  return sanitizeAppRelativeHref(
    `/venue/${encodeURIComponent(slug)}/${seg}/${encodeURIComponent(raw)}`,
    '/',
  );
}

export function reservationSessionsHref(
  startsAt: Date,
  tab: ReservationNotificationTab,
): string {
  if (tab === 'events') return '/sessions?tab=events';
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}`;
  return sanitizeAppRelativeHref(`/sessions?tab=${tab}&date=${date}`);
}

export function reservationTabFromHref(
  href: string | null | undefined,
): ReservationNotificationTab {
  if (!href) return 'schedule';
  if (href.includes('tab=events')) return 'events';
  if (href.includes('tab=dining')) return 'dining';
  return 'schedule';
}

const hrefHasSessionsWhere: Prisma.NotificationWhereInput = {
  href: { contains: '/sessions' },
};

const hrefNoSessionsWhere: Prisma.NotificationWhereInput = {
  OR: [{ href: null }, { NOT: { href: { contains: '/sessions' } } }],
};

const titleDiningWhere: Prisma.NotificationWhereInput = {
  OR: [
    { title: { contains: 'table', mode: 'insensitive' } },
    { title: { contains: 'dining', mode: 'insensitive' } },
  ],
};

const titleGamingWhere: Prisma.NotificationWhereInput = {
  OR: [
    { title: { contains: 'gaming', mode: 'insensitive' } },
    { title: { contains: 'game booking', mode: 'insensitive' } },
    { title: { contains: 'booking starts', mode: 'insensitive' } },
    { title: { contains: 'booking is starting', mode: 'insensitive' } },
  ],
};

const titleEventsWhere: Prisma.NotificationWhereInput = {
  AND: [
    { title: { contains: 'event', mode: 'insensitive' } },
    { title: { contains: 'request', mode: 'insensitive' } },
  ],
};

/**
 * SQL filter matching {@link classifyReservationNotificationTab} for one tab.
 * Mutually exclusive across dining / schedule / events (same precedence as JS).
 */
export function reservationNotificationTabWhere(
  tab: ReservationNotificationTab,
): Prisma.NotificationWhereInput {
  switch (tab) {
    case 'dining':
      return {
        OR: [
          {
            AND: [
              hrefHasSessionsWhere,
              { href: { contains: 'tab=dining' } },
            ],
          },
          { AND: [hrefNoSessionsWhere, titleDiningWhere] },
        ],
      };
    case 'events':
      return {
        OR: [
          {
            AND: [
              hrefHasSessionsWhere,
              { href: { contains: 'tab=events' } },
            ],
          },
          {
            AND: [
              hrefNoSessionsWhere,
              { NOT: titleDiningWhere },
              { NOT: titleGamingWhere },
              titleEventsWhere,
            ],
          },
        ],
      };
    case 'schedule':
      return {
        OR: [
          {
            AND: [
              hrefHasSessionsWhere,
              { NOT: { href: { contains: 'tab=events' } } },
              { NOT: { href: { contains: 'tab=dining' } } },
            ],
          },
          {
            AND: [
              hrefNoSessionsWhere,
              { NOT: titleDiningWhere },
              titleGamingWhere,
            ],
          },
        ],
      };
  }
}

/** Maps unread reservation notifications to dining / gaming / events tabs. */
export function classifyReservationNotificationTab(input: {
  href: string | null;
  title: string;
}): ReservationNotificationTab | null {
  if (input.href?.includes('/sessions')) {
    return reservationTabFromHref(input.href);
  }

  const title = input.title.toLowerCase();
  if (title.includes('table') || title.includes('dining')) return 'dining';
  if (
    title.includes('gaming') ||
    title.includes('game booking') ||
    title.includes('booking starts') ||
    title.includes('booking is starting')
  ) {
    return 'schedule';
  }
  if (title.includes('event') && title.includes('request')) return 'events';

  return null;
}
