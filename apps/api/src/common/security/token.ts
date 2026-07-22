import { randomBytes, createHash } from 'crypto';

/**
 * Auth secret tokens (owner password-reset, staff activate/invite).
 *
 * Staff invite lifecycle:
 * - Issue (`StaffService.create` / `regenerateInvite`): raw once → SHA-256 hex +
 *   `inviteExpiresAt` (7d TTL); membership active seat counted at create.
 * - Activate (`AuthService.activateStaffInvite`): lookup hash + expiry + active +
 *   `passwordSetAt` null → seat assert (used−1) → set password → clear invite
 *   hash/expiry atomically (`updateMany` count === 1) → dual-write permission rows.
 * - Reuse / expired / inactive / over-seat: refuse.
 *
 * Owner password-reset: same hash+expiry pattern on `User`; clear on success.
 * Never store raw tokens in DB.
 */

export function generateRefreshTokenRaw(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** One-time staff activation link token (shown once to the venue owner). */
export function generateStaffInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
