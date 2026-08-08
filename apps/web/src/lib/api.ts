import { trackEvent } from "./analytics";
import { getApiBaseUrl } from "./api-base-url";
import {
  apiErrorFromResponse,
  csrfInvalidUserMessage,
  networkUnreachableMessage,
  permissionDeniedUserMessage,
  sessionRevokedUserMessage,
  venueAccessDeniedUserMessage,
} from "./api-error-message";
import { notifySessionRevoked } from "./auth-session";
import {
  getCsrfHeaders,
  getCsrfTokenFromDocument,
  setCachedCsrfToken,
} from "./csrf";
import { getVenuePathHeaders } from "./venue-api-headers";

export const API_BASE_URL = getApiBaseUrl();

function trackSuccessfulPublicVenueSearch(path: string, body: unknown): void {
  if (typeof window === "undefined") return;
  const [pathname, queryString] = path.split("?", 2);
  if (pathname !== "/public/venues" || !queryString) return;

  const params = new URLSearchParams(queryString);
  const query = params.get("q")?.trim() ?? "";
  const city = params.get("city")?.trim() ?? "";
  const country = params.get("country")?.trim() ?? "";
  const categories =
    params
      .get("categories")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  if (!query && !city && !country && categories.length === 0) return;

  const total =
    body &&
    typeof body === "object" &&
    typeof (body as { total?: unknown }).total === "number"
      ? (body as { total: number }).total
      : undefined;

  // Do not send the raw free-text query: users can type arbitrary PII there.
  trackEvent({
    event: "search_venues",
    has_query: Boolean(query),
    query_length: query ? query.length : 0,
    city: city || undefined,
    country: country || undefined,
    category_count: categories.length,
    result_count: total,
  });
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /** Domain or default error code from API envelope (§36 dual-read). */
  code?: string;
  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
  ) {
    super(message);
    this.status = status;
    this.details = details;
    if (code) this.code = code;
  }
}

export { httpFailureMessage, networkUnreachableMessage } from "./api-error-message";

const BUILTIN_API_ERROR_COPY: Record<string, () => string> = {
  CSRF_INVALID: csrfInvalidUserMessage,
  PERMISSION_DENIED: permissionDeniedUserMessage,
  VENUE_ACCESS_DENIED: venueAccessDeniedUserMessage,
  SESSION_REVOKED: sessionRevokedUserMessage,
};

/** Prefer stable `code` copy when mapped; fall back to server `message`. */
export function resolveApiErrorDisplay(
  err: unknown,
  byCode: Record<string, string>,
  fallback: string,
): string {
  if (err instanceof ApiError) {
    if (err.code && byCode[err.code]) return byCode[err.code];
    if (err.code && BUILTIN_API_ERROR_COPY[err.code]) {
      return BUILTIN_API_ERROR_COPY[err.code]();
    }
    if (err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function throwApiErrorFromResponse(
  res: Response,
  body: unknown,
  csrfRetried: boolean,
): never {
  const { message, code } = apiErrorFromResponse(res.status, body);
  const displayMessage =
    csrfRetried && code === "CSRF_INVALID" ? csrfInvalidUserMessage() : message;
  throw new ApiError(displayMessage, res.status, body, code);
}

/** Bootstrap double-submit CSRF cookie (safe GET). */
export async function ensureCsrf(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/csrf`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      const fallback = getCsrfTokenFromDocument();
      if (fallback) setCachedCsrfToken(fallback);
      return fallback;
    }
    const body = (await res.json()) as { csrfToken?: string };
    const token = body.csrfToken ?? getCsrfTokenFromDocument();
    if (token) setCachedCsrfToken(token);
    return token;
  } catch {
    const fallback = getCsrfTokenFromDocument();
    if (fallback) setCachedCsrfToken(fallback);
    return fallback;
  }
}

function buildJsonHeaders(init?: RequestInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...getVenuePathHeaders(),
    ...getCsrfHeaders(),
    ...(init?.headers ?? {}),
  };
}

function shouldAttemptSessionRefresh(path: string, status: number): boolean {
  if (status !== 401) return false;
  const p = path.split("?")[0] ?? path;
  return (
    !p.endsWith("/auth/refresh") &&
    !p.endsWith("/auth/login") &&
    !p.endsWith("/auth/logout") &&
    !p.endsWith("/auth/csrf") &&
    !p.includes("/auth/mfa/verify")
  );
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh for mid-session access expiry. */
async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      await ensureCsrf();
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: buildJsonHeaders({ method: "POST" }),
      });
      if (res.ok) return true;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      const { code } = apiErrorFromResponse(res.status, body);
      if (code === "SESSION_REVOKED" || res.status === 401) {
        notifySessionRevoked();
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Credentialed fetch with venue + CSRF headers (no forced JSON Content-Type). */
export async function credentialedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const run = () => {
    const { headers: _ignored, ...rest } = init;
    return fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: {
        ...getVenuePathHeaders(),
        ...getCsrfHeaders(),
        ...(init.headers ?? {}),
      },
    });
  };

  let res: Response;
  try {
    res = await run();
  } catch {
    throw new ApiError(networkUnreachableMessage(API_BASE_URL), 0);
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
    res = await run();
  }

  if (shouldAttemptSessionRefresh(path, res.status)) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      res = await run();
    }
  }

  return res;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { headers: _ignored, ...rest } = init;
  const run = () =>
    fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: buildJsonHeaders(init),
    });

  let res: Response;
  try {
    res = await run();
  } catch {
    throw new ApiError(networkUnreachableMessage(API_BASE_URL), 0);
  }

  // Rare race: session cookies exist but csrf cookie not yet readable — retry once.
  const method = (init.method ?? "GET").toUpperCase();
  let csrfRetried = false;
  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
    csrfRetried = true;
    res = await run();
  }

  if (shouldAttemptSessionRefresh(path, res.status)) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      res = await run();
    }
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    if (
      res.status === 401 &&
      body &&
      typeof body === "object" &&
      (body as { code?: string }).code === "SESSION_REVOKED"
    ) {
      notifySessionRevoked();
    }
    throwApiErrorFromResponse(res, body, csrfRetried);
  }

  trackSuccessfulPublicVenueSearch(path, body);
  return body as T;
}
