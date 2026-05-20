import { getApiBaseUrl, getApiOrigin } from "./api-base-url";

/** Resolve upload paths stored by the API to a browser URL. */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const apiBase = getApiBaseUrl();
  if (
    normalized.startsWith("/uploads/") ||
    normalized.startsWith("/media/")
  ) {
    if (apiBase.startsWith("/")) {
      return `${apiBase}${normalized}`;
    }
    const origin = getApiOrigin();
    return `${origin}/api/v1${normalized}`;
  }
  if (apiBase.startsWith("/")) {
    return `${apiBase}${normalized}`;
  }
  const origin = getApiOrigin();
  return `${origin}${normalized}`;
}
