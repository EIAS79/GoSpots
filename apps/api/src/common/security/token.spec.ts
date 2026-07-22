import {
  generatePasswordResetToken,
  generateStaffInviteToken,
  hashToken,
  PASSWORD_RESET_TTL_MS,
  STAFF_INVITE_TTL_MS,
} from './token';

describe('auth secret tokens', () => {
  it('hashes to stable sha256 hex (no plaintext round-trip)', () => {
    const raw = generatePasswordResetToken();
    const hash = hashToken(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashToken(raw));
    expect(hash).not.toBe(raw);
  });

  it('issues high-entropy password-reset and staff-invite tokens', () => {
    const a = generatePasswordResetToken();
    const b = generatePasswordResetToken();
    const c = generateStaffInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(c.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).not.toBe(hashToken(c));
  });

  it('defines TTLs (reset 1h, staff invite 7d)', () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(60 * 60 * 1000);
    expect(STAFF_INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
