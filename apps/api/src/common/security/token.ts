import { randomBytes, createHash } from "crypto";

export function generateRefreshTokenRaw(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** One-time staff activation link token (shown once to the venue owner). */
export function generateStaffInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
