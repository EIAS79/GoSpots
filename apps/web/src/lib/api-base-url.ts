/**
 * API base URL for fetch() and media links.
 *
 * Production/Vercel: set NEXT_PUBLIC_API_BASE_URL=/api/v1 and API_PROXY_TARGET
 * to the hosted Nest API. Browser traffic stays same-origin through /api/v1.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const isProd = process.env.NODE_ENV === "production";

  if (configured) {
    const normalized = configured.replace(/\/$/, "");
    if (normalized.startsWith("/")) {
      if (typeof window !== "undefined") return normalized;

      const host = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.WEB_APP_URL?.trim();
      if (!host) {
        if (isProd) {
          throw new Error(
            "Production SSR cannot resolve a relative NEXT_PUBLIC_API_BASE_URL without VERCEL_URL or WEB_APP_URL.",
          );
        }
        return `http://localhost:3000${normalized}`;
      }
      return `${host.replace(/\/$/, "")}${normalized}`;
    }
    return normalized;
  }

  if (isProd) {
    // The production browser defaults to the same-origin proxy. SSR must have a
    // concrete host and must never silently fall back to localhost.
    if (typeof window !== "undefined") return "/api/v1";
    const host = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.WEB_APP_URL?.trim();
    if (!host) {
      throw new Error(
        "Production API URL is not configured. Set NEXT_PUBLIC_API_BASE_URL=/api/v1 and API_PROXY_TARGET, or provide an absolute NEXT_PUBLIC_API_BASE_URL.",
      );
    }
    return `${host.replace(/\/$/, "")}/api/v1`;
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
