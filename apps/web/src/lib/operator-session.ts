const OPERATOR_SESSION_STORAGE_KEY = "gospots.operatorSession.v1";

export type StoredOperatorSession = {
  token: string;
  membershipId: string;
  displayName: string;
  authStrength: "PIN" | "BADGE";
  expiresAt: string;
};

export function setOperatorSession(session: StoredOperatorSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) {
    sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
    window.dispatchEvent(new Event("gospots:operator-session"));
    return;
  }
  sessionStorage.setItem(OPERATOR_SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("gospots:operator-session"));
}

export function getOperatorSession(): StoredOperatorSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(OPERATOR_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredOperatorSession>;
    if (
      typeof value.token !== "string" ||
      typeof value.membershipId !== "string" ||
      typeof value.displayName !== "string" ||
      (value.authStrength !== "PIN" && value.authStrength !== "BADGE") ||
      typeof value.expiresAt !== "string"
    ) {
      sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
      return null;
    }
    if (new Date(value.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
      return null;
    }
    return value as StoredOperatorSession;
  } catch {
    sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearOperatorSession(): void {
  setOperatorSession(null);
}

export function getOperatorAttributionHeaders(): Record<string, string> {
  const session = getOperatorSession();
  return session ? { "x-operator-token": session.token } : {};
}
