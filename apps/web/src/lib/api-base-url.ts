/**
 * Browser API base URL.
 * Production on Vercel: set NEXT_PUBLIC_API_BASE_URL=/api/v1 and API_PROXY_TARGET
 * to your hosted Nest API so auth cookies stay on the Vercel domain.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return "/api/v1";
  return "http://localhost:4000/api/v1";
}

/** Origin for media paths (/media, /uploads) — empty when API is same-origin relative. */
export function getApiOrigin(): string {
  const base = getApiBaseUrl();
  if (base.startsWith("/")) return "";
  return base.replace(/\/api\/v1\/?$/, "");
}
