/** JWT access-token payload (shared across Nest modules). */
export interface JwtAccessPayload {
  sub: string; // user id
  sysRole: string;
  email: string;
  acct?: string; // VENUE_OWNER | VENUE_STAFF
  sid?: string; // auth session id (staff: single active session)
  // Active membership context (optional — picked first owned shop on login).
  shopId?: string;
  shopRole?: string;
  perms?: string; // CSV
  tier?: string;
}
