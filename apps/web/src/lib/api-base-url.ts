/**
 * API base URL for fetch() and media links.
 *
 * Vercel: set NEXT_PUBLIC_API_BASE_URL=/api/v1 and API_PROXY_TARGET to your
 * hosted Nest API. Browser uses same-origin /api/v1; SSR uses https://{VERCEL_URL}/api/v1.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    const normalized = configured.replace(/\/$/, "");
    if (normalized.startsWith("/")) {
      if (typeof window !== "undefined") {
        return normalized;
      }
      const host = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.WEB_APP_URL ?? "http://localhost:3000";
      return `${host.replace(/\/$/, "")}${normalized}`;
    }
    return normalized;
  }

  if (typeof window !== "undefined") return "/api/v1";
  return "http://localhost:4000/api/v1";
}

/** Origin for absolute media URLs when API base is a full URL. */
export function getApiOrigin(): string {
  const base = getApiBaseUrl();
  if (base.startsWith("/")) return "";
  return base.replace(/\/api\/v1\/?$/, "");
}
