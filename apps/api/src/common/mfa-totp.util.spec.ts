import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
  normalizeTotpCode,
  verifyTotpCode,
} from './mfa-totp.util';

describe('mfa-totp.util', () => {
  const keySource = { mfaTotpEncryptionKey: 'a'.repeat(64) };

  it('generates base32 secrets and matching otpauth URIs', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(26);
    const uri = buildOtpAuthUri({
      secret,
      accountName: 'owner@example.com',
      issuer: 'Locora',
    });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(secret);
    expect(uri).toContain('issuer=Locora');
  });

  it('verifies current TOTP and rejects wrong codes', () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, '000000')).toBe(false);
    expect(normalizeTotpCode('12 34 56')).toBe('123456');
    expect(normalizeTotpCode('abc')).toBeNull();
  });

  it('accepts codes within the time window', () => {
    const secret = generateTotpSecret();
    const nowMs = Date.now();
    const prevCounter = Math.floor(nowMs / 1000 / 30) - 1;
    const prev = generateTotpCode(secret, prevCounter);
    expect(verifyTotpCode(secret, prev, { nowMs, window: 1 })).toBe(true);
  });

  it('round-trips encrypted TOTP secrets', () => {
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(secret, keySource);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptTotpSecret(enc, keySource)).toBe(secret);
  });

  it('falls back to JWT secret for encryption key material', () => {
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(secret, {
      jwtAccessSecret: 'dev-jwt-access-secret-min-32-chars!!',
    });
    expect(decryptTotpSecret(enc, {
      jwtAccessSecret: 'dev-jwt-access-secret-min-32-chars!!',
    })).toBe(secret);
  });
});
