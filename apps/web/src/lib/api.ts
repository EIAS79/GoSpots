import { getApiBaseUrl } from "./api-base-url";
import {
  apiErrorFromResponse,
  csrfInvalidUserMessage,
  networkUnreachableMessage,
  permissionDeniedUserMessage,
  sessionRevokedUserMessage,
  venueAccessDeniedUserMessage,
} from "./api-error-message";
import {
  getCsrfHeaders,
  getCsrfTokenFromDocument,
  setCachedCsrfToken,
} from "./csrf";
import { getVenuePathHeaders } from "./venue-api-headers";

export const API_BASE_URL = getApiBaseUrl();

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

  return res;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { headers: _ignored, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: buildJsonHeaders(init),
    });
  } catch {
    throw new ApiError(networkUnreachableMessage(API_BASE_URL), 0);
  }

  // Rare race: session cookies exist but csrf cookie not yet readable — retry once.
  const method = (init.method ?? "GET").toUpperCase();
  let csrfRetried = false;
  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
    csrfRetried = true;
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: buildJsonHeaders(init),
    });
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throwApiErrorFromResponse(res, body, csrfRetried);
  }

  return body as T;
}
