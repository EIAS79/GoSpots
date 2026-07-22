/**
 * Same-app relative href only (mirrors API `reservation-notification-href`).
 * Blocks absolute URLs, protocol-relative `//…`, backslashes, and `..` segments.
 */
export function isSafeAppRelativeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  if (trimmed.includes("\\") || trimmed.includes("\0")) return false;
  if (trimmed.includes("..")) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "http://app.local");
  } catch {
    return false;
  }
  if (parsed.origin !== "http://app.local") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.pathname.split("/").includes("..")) return false;
  return true;
}

/** Dashboard notification link: venue base + safe relative href, or null. */
export function notificationNavHref(
  hrefBase: string,
  href: string | null | undefined,
): string | null {
  if (!href || !isSafeAppRelativeHref(href)) return null;
  return `${hrefBase}${href}`;
}

/** Public guest status / track link from API `statusPath`. */
export function safeStatusPathHref(
  statusPath: string | null | undefined,
): string | null {
  if (!statusPath || !isSafeAppRelativeHref(statusPath)) return null;
  return statusPath;
}
