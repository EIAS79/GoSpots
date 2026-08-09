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

function createClientRequestId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall back to a browser-safe correlation id below.
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function diagnosticPath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  return (
    pathname === "/auth/me" ||
    pathname === "/auth/refresh" ||
    pathname.startsWith("/billing/")
  );
}

function safeCheckoutContext(
  path: string,
  init: RequestInit,
): Record<string, unknown> {
  const pathname = path.split("?")[0] ?? path;
  if (pathname !== "/billing/checkout") return {};
  if (typeof init.body !== "string") return {};

  try {
    const parsed = JSON.parse(init.body) as Record<string, unknown>;
    return {
      provider:
        typeof parsed.provider === "string" ? parsed.provider : undefined,
      renewalMode:
        typeof parsed.renewalMode === "string"
          ? parsed.renewalMode
          : undefined,
      packId: typeof parsed.packId === "string" ? parsed.packId : undefined,
      currency:
        typeof parsed.currency === "string" ? parsed.currency : undefined,
      seatQuantity:
        typeof parsed.seatQuantity === "number"
          ? parsed.seatQuantity
          : undefined,
      addOnCount: Array.isArray(parsed.addOnIds)
        ? parsed.addOnIds.length
        : undefined,
      autoRenewConsent:
        typeof parsed.autoRenewConsent === "boolean"
          ? parsed.autoRenewConsent
          : undefined,
      trialDays:
        typeof parsed.trialDays === "number" ? parsed.trialDays : undefined,
    };
  } catch {
    return { checkoutBodyParseable: false };
  }
}

function errorEnvelopeSummary(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const value = body as Record<string, unknown>;
  const details =
    value.details && typeof value.details === "object"
      ? (value.details as Record<string, unknown>)
      : null;

  // Never dump arbitrary API details into the browser console. Only expose
  // diagnostic fields intentionally designed to be safe for operators.
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    requestId:
      typeof value.requestId === "string" ? value.requestId : undefined,
    stage:
      details && typeof details.stage === "string" ? details.stage : undefined,
    provider:
      details && typeof details.provider === "string"
        ? details.provider
        : undefined,
    providerCode:
      details && typeof details.providerCode === "string"
        ? details.providerCode
        : undefined,
    providerRequestId:
      details && typeof details.providerRequestId === "string"
        ? details.providerRequestId
        : undefined,
    reason:
      details && typeof details.reason === "string"
        ? details.reason
        : undefined,
  };
}

function responseRequestId(
  res: Response,
  body: unknown,
  fallback: string,
): string {
  if (body && typeof body === "object") {
    const fromBody = (body as { requestId?: unknown }).requestId;
    if (typeof fromBody === "string" && fromBody.trim()) return fromBody;
  }
  return res.headers.get("x-request-id") || fallback;
}

function logRequestStart(
  path: string,
  method: string,
  requestId: string,
  init: RequestInit,
): void {
  if (!diagnosticPath(path) || typeof console === "undefined") return;
  console.info(`[GoSpots API][${requestId}] → ${method} ${path}`, {
    requestId,
    method,
    path,
    apiBaseUrl: API_BASE_URL,
    ...safeCheckoutContext(path, init),
  });
}

function logResponse(
  path: string,
  method: string,
  requestId: string,
  res: Response,
  started: number,
  attempt: string,
): void {
  if (!diagnosticPath(path) || typeof console === "undefined") return;
  const serverRequestId = res.headers.get("x-request-id") || requestId;
  const payload = {
    requestId: serverRequestId,
    clientRequestId: requestId,
    method,
    path,
    status: res.status,
    statusText: res.statusText,
    attempt,
    durationMs: Math.max(0, Date.now() - started),
  };
  if (res.ok) {
    console.info(
      `[GoSpots API][${serverRequestId}] ← ${res.status} ${method} ${path}`,
      payload,
    );
  } else {
    console.warn(
      `[GoSpots API][${serverRequestId}] ← ${res.status} ${method} ${path}`,
      payload,
    );
  }
}

function logApiFailure(input: {
  path: string;
  method: string;
  requestId: string;
  res?: Response;
  body?: unknown;
  started: number;
  csrfRetried?: boolean;
  sessionRefreshAttempted?: boolean;
  networkError?: unknown;
  init: RequestInit;
}): void {
  if (!diagnosticPath(input.path) || typeof console === "undefined") return;
  const id = input.res
    ? responseRequestId(input.res, input.body, input.requestId)
    : input.requestId;
  const networkMessage =
    input.networkError instanceof Error
      ? input.networkError.message
      : input.networkError
        ? String(input.networkError)
        : undefined;

  console.error(
    `[GoSpots API][${id}] ✕ ${input.method} ${input.path} failed`,
    {
      requestId: id,
      clientRequestId: input.requestId,
      status: input.res?.status ?? 0,
      statusText: input.res?.statusText,
      durationMs: Math.max(0, Date.now() - input.started),
      csrfRetried: input.csrfRetried === true,
      sessionRefreshAttempted: input.sessionRefreshAttempted === true,
      networkError: networkMessage,
      ...safeCheckoutContext(input.path, input.init),
      ...errorEnvelopeSummary(input.body),
      serverLogHint:
        "Search API logs for this requestId. The matching server error log includes the exact exception stack and provider error metadata.",
    },
  );
}

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
  /** Correlates browser console failures with API/Sentry/provider logs. */
  requestId?: string;
  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
    requestId?: string,
  ) {
    super(message);
    this.status = status;
    this.details = details;
    if (code) this.code = code;
    if (requestId) this.requestId = requestId;
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
  fallbackRequestId: string,
): never {
  const { message, code } = apiErrorFromResponse(res.status, body);
  const displayMessage =
    csrfRetried && code === "CSRF_INVALID" ? csrfInvalidUserMessage() : message;
  throw new ApiError(
    displayMessage,
    res.status,
    body,
    code,
    responseRequestId(res, body, fallbackRequestId),
  );
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

function buildJsonHeaders(
  init?: RequestInit,
  requestId?: string,
): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...getVenuePathHeaders(),
    ...getCsrfHeaders(),
    ...(requestId ? { "x-request-id": requestId } : {}),
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
async function tryRefreshSession(parentRequestId?: string): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const requestId = createClientRequestId();
    const started = Date.now();
    const path = "/auth/refresh";
    const method = "POST";
    const init: RequestInit = { method };

    if (typeof console !== "undefined") {
      console.info(`[GoSpots Auth][${requestId}] → refreshing session`, {
        requestId,
        parentRequestId,
      });
    }

    try {
      await ensureCsrf();
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        credentials: "include",
        headers: buildJsonHeaders(init, requestId),
      });
      logResponse(path, method, requestId, res, started, "session-refresh");
      if (res.ok) {
        if (typeof console !== "undefined") {
          console.info(`[GoSpots Auth][${requestId}] ✓ session refresh succeeded`, {
            requestId: res.headers.get("x-request-id") || requestId,
            parentRequestId,
            durationMs: Math.max(0, Date.now() - started),
          });
        }
        return true;
      }

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      logApiFailure({
        path,
        method,
        requestId,
        res,
        body,
        started,
        init,
      });
      const { code } = apiErrorFromResponse(res.status, body);
      if (code === "SESSION_REVOKED" || res.status === 401) {
        notifySessionRevoked();
      }
      return false;
    } catch (error) {
      logApiFailure({
        path,
        method,
        requestId,
        started,
        init,
        networkError: error,
      });
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
  const requestId = createClientRequestId();
  const method = (init.method ?? "GET").toUpperCase();
  const started = Date.now();
  let attempt = 0;

  logRequestStart(path, method, requestId, init);

  const run = async (label: string) => {
    attempt += 1;
    const { headers: _ignored, ...rest } = init;
    const res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: {
        ...getVenuePathHeaders(),
        ...getCsrfHeaders(),
        "x-request-id": requestId,
        ...(init.headers ?? {}),
      },
    });
    logResponse(path, method, requestId, res, started, `${label}-${attempt}`);
    return res;
  };

  let res: Response;
  try {
    res = await run("initial");
  } catch (error) {
    logApiFailure({
      path,
      method,
      requestId,
      started,
      init,
      networkError: error,
    });
    throw new ApiError(
      networkUnreachableMessage(API_BASE_URL),
      0,
      undefined,
      undefined,
      requestId,
    );
  }

  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    if (diagnosticPath(path) && typeof console !== "undefined") {
      console.warn(`[GoSpots API][${requestId}] CSRF retry`, {
        requestId,
        method,
        path,
      });
    }
    await ensureCsrf();
    res = await run("csrf-retry");
  }

  if (shouldAttemptSessionRefresh(path, res.status)) {
    if (diagnosticPath(path) && typeof console !== "undefined") {
      console.warn(`[GoSpots API][${requestId}] 401; attempting session refresh`, {
        requestId,
        method,
        path,
      });
    }
    const refreshed = await tryRefreshSession(requestId);
    if (refreshed) {
      res = await run("post-refresh");
    }
  }

  return res;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const requestId = createClientRequestId();
  const method = (init.method ?? "GET").toUpperCase();
  const started = Date.now();
  let attempt = 0;
  let sessionRefreshAttempted = false;

  logRequestStart(path, method, requestId, init);

  const { headers: _ignored, ...rest } = init;
  const run = async (label: string) => {
    attempt += 1;
    const res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: buildJsonHeaders(init, requestId),
    });
    logResponse(path, method, requestId, res, started, `${label}-${attempt}`);
    return res;
  };

  let res: Response;
  try {
    res = await run("initial");
  } catch (error) {
    logApiFailure({
      path,
      method,
      requestId,
      started,
      init,
      networkError: error,
    });
    throw new ApiError(
      networkUnreachableMessage(API_BASE_URL),
      0,
      undefined,
      undefined,
      requestId,
    );
  }

  // Rare race: session cookies exist but csrf cookie not yet readable — retry once.
  let csrfRetried = false;
  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    if (diagnosticPath(path) && typeof console !== "undefined") {
      console.warn(`[GoSpots API][${requestId}] CSRF retry`, {
        requestId,
        method,
        path,
      });
    }
    await ensureCsrf();
    csrfRetried = true;
    try {
      res = await run("csrf-retry");
    } catch (error) {
      logApiFailure({
        path,
        method,
        requestId,
        started,
        init,
        csrfRetried,
        networkError: error,
      });
      throw new ApiError(
        networkUnreachableMessage(API_BASE_URL),
        0,
        undefined,
        undefined,
        requestId,
      );
    }
  }

  if (shouldAttemptSessionRefresh(path, res.status)) {
    sessionRefreshAttempted = true;
    if (diagnosticPath(path) && typeof console !== "undefined") {
      console.warn(`[GoSpots API][${requestId}] 401; attempting session refresh`, {
        requestId,
        method,
        path,
      });
    }
    const refreshed = await tryRefreshSession(requestId);
    if (refreshed) {
      try {
        res = await run("post-refresh");
      } catch (error) {
        logApiFailure({
          path,
          method,
          requestId,
          started,
          init,
          csrfRetried,
          sessionRefreshAttempted,
          networkError: error,
        });
        throw new ApiError(
          networkUnreachableMessage(API_BASE_URL),
          0,
          undefined,
          undefined,
          requestId,
        );
      }
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
    logApiFailure({
      path,
      method,
      requestId,
      res,
      body,
      started,
      csrfRetried,
      sessionRefreshAttempted,
      init,
    });
    throwApiErrorFromResponse(res, body, csrfRetried, requestId);
  }

  trackSuccessfulPublicVenueSearch(path, body);
  return body as T;
}
