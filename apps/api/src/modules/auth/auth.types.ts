/** JWT access-token payload (shared across Nest modules). */
export interface JwtAccessPayload {
  sub: string; // user id
  sysRole: string;
  email: string;
  acct?: string; // VENUE_OWNER | VENUE_STAFF
  /** Auth session id — validated on every request for owners and staff. */
  sid?: string;
  // Active membership context (optional — picked first owned shop on login).
  shopId?: string;
  shopRole?: string;
  perms?: string; // CSV
  tier?: string;
}
