import { clearCachedCsrfToken } from "./csrf";

const SESSION_REVOKED_FLAG = "gospots.session-revoked";

type GuestHandler = () => void;
let guestHandler: GuestHandler | null = null;

/** AuthProvider registers to clear React session state on forced sign-out. */
export function registerAuthGuestHandler(handler: GuestHandler) {
  guestHandler = handler;
  return () => {
    if (guestHandler === handler) guestHandler = null;
  };
}

/** Clear cookies client-side and mark login notice (§36 SESSION_REVOKED). */
export function notifySessionRevoked() {
  clearCachedCsrfToken();
  try {
    sessionStorage.setItem(SESSION_REVOKED_FLAG, "1");
  } catch {
    /* ignore */
  }
  guestHandler?.();
}

/** One-shot flag for login surface after redirect (§36 W2). */
export function consumeSessionRevokedNotice(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_REVOKED_FLAG) !== "1") return false;
    sessionStorage.removeItem(SESSION_REVOKED_FLAG);
    return true;
  } catch {
    return false;
  }
}
