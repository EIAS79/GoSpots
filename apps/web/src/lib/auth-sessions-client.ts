import { api, ApiError } from "./api";

/** Active AuthSession row from `GET /auth/sessions` (no tokens/hashes). */
export type AuthSessionRow = {
  id: string;
  createdAt: string;
  userAgent: string | null;
  expiresAt: string;
};

export type AuthSessionsListResponse = {
  sessions: AuthSessionRow[];
};

export type RevokeOthersResponse = {
  revokedCount: number;
};

export function fetchAuthSessions() {
  return api<AuthSessionsListResponse>("/auth/sessions");
}

/** Revoke one session (and its refresh family). 204. */
export function revokeAuthSession(id: string) {
  return api<void>(`/auth/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Revoke every other active session; keeps the current refresh/`sid` family. */
export function revokeOtherAuthSessions() {
  return api<RevokeOthersResponse>("/auth/sessions/revoke-others", {
    method: "POST",
  });
}

export function authSessionsErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Could not update sessions.";
}

/** Short label from a User-Agent string for the sessions list. */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua?.trim()) return "Unknown device";
  const s = ua.trim();
  const browser =
    /Edg\/[\d.]+/i.test(s) ? "Edge"
    : /OPR\/[\d.]+|Opera/i.test(s) ? "Opera"
    : /Chrome\/[\d.]+/i.test(s) && !/Chromium/i.test(s) ? "Chrome"
    : /Firefox\/[\d.]+/i.test(s) ? "Firefox"
    : /Safari\/[\d.]+/i.test(s) && !/Chrome/i.test(s) ? "Safari"
    : null;
  const os =
    /Windows NT/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
    : /iPhone|iPad|iPod/i.test(s) ? "iOS"
    : /Mac OS X/i.test(s) ? "macOS"
    : /Linux/i.test(s) ? "Linux"
    : null;
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return s.length > 64 ? `${s.slice(0, 61)}…` : s;
}
