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
  return "Can’t reach Locora servers — try again shortly.";
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
    return "Can’t reach Locora servers — try again shortly.";
  }
  if (status === 503) {
    return "Locora is temporarily unavailable — your data is safe; retry in a minute.";
  }
  return `Request failed: ${status}`;
}
