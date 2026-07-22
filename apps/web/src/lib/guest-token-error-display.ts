import { ApiError, resolveApiErrorDisplay } from "./api";
import { translatePublic } from "./public-i18n";
import type { PublicLocale } from "./public-prefs";

function guestTokenCopyByCode(locale: PublicLocale): Record<string, string> {
  return {
    GUEST_TOKEN_EXPIRED: translatePublic(locale, "guestStatus.tokenExpired"),
    GUEST_TOKEN_REVOKED: translatePublic(locale, "guestStatus.tokenRevoked"),
  };
}

/** §36 W2 — prefer stable guest-token codes; fall back to server message / caller fallback. */
export function resolveGuestTokenApiErrorDisplay(
  err: unknown,
  locale: PublicLocale,
  fallback: string,
): string {
  return resolveApiErrorDisplay(err, guestTokenCopyByCode(locale), fallback);
}

export function isGuestTokenApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    (err.code === "GUEST_TOKEN_EXPIRED" || err.code === "GUEST_TOKEN_REVOKED")
  );
}
