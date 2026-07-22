import type { ShopRole } from "./auth-client";

/** Mirrors API `STAFF_MFA_OPT_IN` — default off until operator enables on web + API. */
export function isStaffMfaOptInEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_STAFF_MFA_OPT_IN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export function isStaffMfaEligibleRole(role: ShopRole | undefined): boolean {
  return role === "MANAGER" || role === "OWNER";
}
