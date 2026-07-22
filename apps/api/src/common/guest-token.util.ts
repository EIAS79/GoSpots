import { timingSafeEqual } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { generateRefreshTokenRaw, hashToken } from './security/token';

/**
 * Guest status / cancel / chat link secrets.
 *
 * Dual-read transition (documented choice):
 * - **New writes:** persist `guestTokenHash` + `guestTokenExpiresAt` only;
 *   `guestToken` plaintext is set to null (`guestTokenPersistFields`).
 * - **Reads:** lookup by hash OR legacy plaintext (`guestTokenLookupWhere`);
 *   verify with timing-safe compare (`verifyPresentedGuestToken`); then
 *   enforce expiry/revocation (`assertGuestTokenActive`).
 * - **Migration backfill** hashes existing plaintext but keeps plaintext so old
 *   emailed links and staff copy-paste keep working until rows are revoked or
 *   rewritten. Do not wipe legacy plaintext in app code except on revoke.
 * - Raw token is returned to the guest **once** (API response / email URL);
 *   never re-derived from hash.
 */

/** Default guest booking / event link TTL (30 days). */
export const GUEST_TOKEN_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Guest support chat TTL (7 days). */
export const GUEST_CHAT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedGuestToken = {
  /** Raw secret — return once to the guest; never persist. */
  raw: string;
  hash: string;
  expiresAt: Date;
};

export type GuestTokenRow = {
  guestToken: string | null;
  guestTokenHash: string | null;
  guestTokenExpiresAt: Date | null;
  guestTokenRevokedAt: Date | null;
};

/** High-entropy raw token (same strength as refresh tokens). */
export function generateGuestTokenRaw(): string {
  return generateRefreshTokenRaw();
}

export function hashGuestToken(raw: string): string {
  return hashToken(raw.trim());
}

/** Timing-safe equality for hex digests (or any equal-length utf8 strings). */
export function guestTokenHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function issueGuestToken(opts?: {
  ttlMs?: number;
  from?: Date;
}): IssuedGuestToken {
  const raw = generateGuestTokenRaw();
  const hash = hashGuestToken(raw);
  const from = opts?.from ?? new Date();
  const ttl = opts?.ttlMs ?? GUEST_TOKEN_DEFAULT_TTL_MS;
  return {
    raw,
    hash,
    expiresAt: new Date(from.getTime() + ttl),
  };
}

/** Prisma create/update payload — hash only (no plaintext). */
export function guestTokenPersistFields(issued: IssuedGuestToken) {
  return {
    guestToken: null as string | null,
    guestTokenHash: issued.hash,
    guestTokenExpiresAt: issued.expiresAt,
    guestTokenRevokedAt: null as Date | null,
  };
}

/**
 * Revoke access; clear any leftover plaintext.
 * Safe to re-apply on cancel / NO_SHOW (idempotent). After this, dual-read
 * still finds the row by hash, but {@link assertGuestTokenActive} refuses reuse.
 */
export function guestTokenRevokeFields(now = new Date()) {
  return {
    guestTokenRevokedAt: now,
    guestToken: null as string | null,
  };
}

/** Whether cancel/status cleanup still needs a revoke write. */
export function guestTokenNeedsRevoke(
  row: Pick<GuestTokenRow, 'guestTokenRevokedAt'>,
): boolean {
  return row.guestTokenRevokedAt == null;
}

/**
 * Dual-read lookup: prefer hash, fall back to legacy plaintext column.
 * Callers must still run {@link assertGuestTokenActive}.
 */
export function guestTokenLookupWhere(shopId: string, rawToken: string) {
  const trimmed = rawToken.trim();
  const hash = hashGuestToken(trimmed);
  return {
    shopId,
    OR: [{ guestTokenHash: hash }, { guestToken: trimmed }],
  };
}

/**
 * After a dual-read find, confirm the presented raw token matches stored
 * secrets in constant time when both sides are available.
 */
export function verifyPresentedGuestToken(
  row: GuestTokenRow,
  rawToken: string,
): boolean {
  const trimmed = rawToken.trim();
  if (!trimmed) return false;
  const presentedHash = hashGuestToken(trimmed);

  if (row.guestTokenHash) {
    if (!guestTokenHashesEqual(row.guestTokenHash, presentedHash)) {
      return false;
    }
    return true;
  }

  if (row.guestToken) {
    const legacyHash = hashGuestToken(row.guestToken);
    return guestTokenHashesEqual(legacyHash, presentedHash);
  }

  return false;
}

export function assertGuestTokenActive(
  row: GuestTokenRow,
  now = new Date(),
): void {
  if (row.guestTokenRevokedAt) {
    throw new BadRequestException('This link has been revoked.');
  }
  if (
    row.guestTokenExpiresAt &&
    row.guestTokenExpiresAt.getTime() < now.getTime()
  ) {
    throw new BadRequestException('This link has expired.');
  }
}
