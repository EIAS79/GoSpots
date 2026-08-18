const OPERATOR_SESSION_STORAGE_KEY = "gospots.operatorSession.v1";
const WORKSTATION_STORAGE_KEY = "gospots.workstationIdentity.v1";

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

/**
 * Stable installation-scoped identifier for quick cashier attribution.
 * It is intentionally not a secret and does not replace the canonical Device
 * registry. It lets the server preserve which browser/workstation performed a
 * quick operator switch even when multiple employees share the same terminal.
 */
export function getWorkstationIdentity(): string {
  if (typeof window === "undefined") return "browser-unavailable";
  const existing = localStorage.getItem(WORKSTATION_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const workstation = `web-${randomPart}`;
  localStorage.setItem(WORKSTATION_STORAGE_KEY, workstation);
  return workstation;
}

export function clearOperatorSession(): void {
  setOperatorSession(null);
}

export function getOperatorAttributionHeaders(): Record<string, string> {
  const session = getOperatorSession();
  return session ? { "x-operator-token": session.token } : {};
}