import { randomBytes, timingSafeEqual } from 'crypto';
import { hashToken } from './security/token';

export const MFA_RECOVERY_CODE_COUNT = 10;
/** Human-readable groups: XXXX-XXXX */
export const MFA_RECOVERY_CODE_GROUP_LEN = 4;
export const MFA_RECOVERY_CODE_GROUPS = 2;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function generateRecoveryCodes(
  count = MFA_RECOVERY_CODE_COUNT,
): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < count) {
    const raw = randomBytes(MFA_RECOVERY_CODE_GROUP_LEN * MFA_RECOVERY_CODE_GROUPS);
    let built = '';
    for (let g = 0; g < MFA_RECOVERY_CODE_GROUPS; g++) {
      if (g > 0) built += '-';
      for (let i = 0; i < MFA_RECOVERY_CODE_GROUP_LEN; i++) {
        const byte =
          raw[g * MFA_RECOVERY_CODE_GROUP_LEN + i] ?? randomBytes(1)[0]!;
        built += ALPHABET[byte % ALPHABET.length];
      }
    }
    const normalized = normalizeRecoveryCode(built);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    codes.push(formatRecoveryCode(normalized));
  }
  return codes;
}

/** Strip separators / whitespace; uppercase. */
export function normalizeRecoveryCode(code: string): string | null {
  const cleaned = String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const expected =
    MFA_RECOVERY_CODE_GROUP_LEN * MFA_RECOVERY_CODE_GROUPS;
  if (cleaned.length !== expected) return null;
  if (![...cleaned].every((ch) => ALPHABET.includes(ch))) return null;
  return cleaned;
}

export function formatRecoveryCode(normalized: string): string {
  const parts: string[] = [];
  for (let i = 0; i < MFA_RECOVERY_CODE_GROUPS; i++) {
    const start = i * MFA_RECOVERY_CODE_GROUP_LEN;
    parts.push(normalized.slice(start, start + MFA_RECOVERY_CODE_GROUP_LEN));
  }
  return parts.join('-');
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) {
    throw new Error('Invalid recovery code format.');
  }
  return hashToken(normalized);
}

/**
 * Find a matching unused recovery-code hash (constant-time across candidates).
 * Returns the matching row id, or null.
 */
export function matchRecoveryCodeHash(
  code: string,
  rows: { id: string; codeHash: string; usedAt: Date | null }[],
): string | null {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return null;
  const target = Buffer.from(hashToken(normalized), 'utf8');
  let matchedId: string | null = null;
  for (const row of rows) {
    if (row.usedAt) continue;
    const candidate = Buffer.from(row.codeHash, 'utf8');
    const sameLen = candidate.length === target.length;
    const equal =
      sameLen && timingSafeEqual(candidate, target);
    // Keep scanning for constant-ish work; first match wins.
    if (equal && matchedId == null) matchedId = row.id;
  }
  return matchedId;
}
