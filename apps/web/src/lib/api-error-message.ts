/**
 * Classified client error copy for connectivity / gateway failures (bible #32).
 * Keeps local-dev Postgres hints on localhost; prod-safe messages elsewhere.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when the API base (or page origin for relative `/api/v1`) looks like local dev. */
export function isLocalDevApiBase(apiBaseUrl: string): boolean {
  try {
    if (apiBaseUrl.startsWith("/")) {
      if (typeof window !== "undefined") {
        return LOCAL_HOSTS.has(window.location.hostname);
      }
      return true;
    }
    const host = new URL(apiBaseUrl).hostname;
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

function browserLooksOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Status 0 / network throw — Mode A (offline) or Mode B (API unreachable). */
export function networkUnreachableMessage(apiBaseUrl: string): string {
  if (browserLooksOffline()) {
    return "No internet connection — changes won’t save until you’re back online.";
  }
  if (isLocalDevApiBase(apiBaseUrl)) {
    return `Cannot reach the API at ${apiBaseUrl}. The backend is probably not running (check terminal for PostgreSQL errors). From repo root run: pnpm db:setup then pnpm dev — then open http://localhost:4000/api/v1/health`;
  }
  return "Can’t reach GoSpots servers — try again shortly.";
}

/** Parsed API error envelope `{ code, message }` (bible §36). */
export type ApiErrorEnvelope = {
  code: string | null;
  message: string | string[] | null;
};

/** Read stable `code` + human `message` from JSON error bodies; tolerates legacy shapes. */
export function parseApiErrorEnvelope(body: unknown): ApiErrorEnvelope {
  if (body == null || typeof body !== "object") {
    return { code: null, message: null };
  }
  const record = body as Record<string, unknown>;
  const rawCode = record.code;
  const code =
    typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : null;
  const rawMessage = record.message;
  const message =
    rawMessage === undefined || rawMessage === null
      ? null
      : (rawMessage as string | string[]);
  return { code, message };
}

/** User-facing copy after CSRF bootstrap retry still returns `CSRF_INVALID` (§36 W2). */
export function csrfInvalidUserMessage(): string {
  return "We couldn't verify this request — refresh the page and try again.";
}

/** User-facing copy when API returns `PERMISSION_DENIED` (§36 W2). */
export function permissionDeniedUserMessage(): string {
  return "You don't have permission to perform this action.";
}

/** User-facing copy when API returns `VENUE_ACCESS_DENIED` (§36 W2). */
export function venueAccessDeniedUserMessage(): string {
  return "You don't have access to this venue.";
}

/** User-facing copy when refresh returns `SESSION_REVOKED` (§36 W2). */
export function sessionRevokedUserMessage(): string {
  return "You were signed out — sign in again.";
}

/** Classified toast copy + optional domain code for dual-read UX. */
export function apiErrorFromResponse(
  status: number,
  body: unknown,
): { message: string; code?: string } {
  const { code, message: bodyMessage } = parseApiErrorEnvelope(body);
  const message = httpFailureMessage(status, bodyMessage);
  return code ? { message, code } : { message };
}

function normalizeBodyMessage(
  message: string | string[] | undefined | null,
): string | null {
  if (message == null) return null;
  if (Array.isArray(message)) {
    const joined = message.map(String).map((s) => s.trim()).filter(Boolean).join(", ");
    return joined || null;
  }
  const t = String(message).trim();
  return t || null;
}

/**
 * Prefer server `message` when useful; classify bare 502/503/504 fallbacks.
 * Softens idempotency in-flight 409s (bible #7); leaves other 4xx / 5xx alone.
 */
export function httpFailureMessage(
  status: number,
  bodyMessage?: string | string[] | null,
): string {
  const fromBody = normalizeBodyMessage(bodyMessage ?? null);
  if (fromBody) {
    if (
      status === 409 &&
      /idempotency-key request is already in progress/i.test(fromBody)
    ) {
      return "Still saving… try again in a moment.";
    }
    return fromBody;
  }

  if (status === 502 || status === 504) {
    return "Can’t reach GoSpots servers — try again shortly.";
  }
  if (status === 503) {
    return "GoSpots is temporarily unavailable — your data is safe; retry in a minute.";
  }
  return `Request failed: ${status}`;
}
