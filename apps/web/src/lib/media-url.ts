import { API_BASE_URL } from "./api";

/** Resolve upload paths stored by the API to a browser URL. */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized.startsWith("/uploads/") ||
    normalized.startsWith("/media/")
  ) {
    return `${origin}/api/v1${normalized}`;
  }
  return `${origin}${normalized}`;
}
