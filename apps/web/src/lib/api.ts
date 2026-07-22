import { getApiBaseUrl } from "./api-base-url";
import {
  httpFailureMessage,
  networkUnreachableMessage,
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
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export { httpFailureMessage, networkUnreachableMessage } from "./api-error-message";

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
  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
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
    const message = httpFailureMessage(
      res.status,
      (body as { message?: string | string[] } | null)?.message,
    );
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}
