import {
  formatRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchRecoveryCodeHash,
  MFA_RECOVERY_CODE_COUNT,
  normalizeRecoveryCode,
} from './mfa-recovery.util';

describe('mfa-recovery.util', () => {
  it('generates the expected number of unique formatted codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(MFA_RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(MFA_RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it('normalizes separators and hashes stably', () => {
    const codes = generateRecoveryCodes(1);
    const formatted = codes[0]!;
    const normalized = normalizeRecoveryCode(formatted.replace('-', ' '));
    expect(normalized).toBe(normalizeRecoveryCode(formatted));
    expect(formatRecoveryCode(normalized!)).toBe(formatted);
    expect(hashRecoveryCode(formatted)).toBe(hashRecoveryCode(normalized!));
  });

  it('matches unused hashes and ignores used rows', () => {
    const [a, b] = generateRecoveryCodes(2);
    const rows = [
      { id: '1', codeHash: hashRecoveryCode(a!), usedAt: new Date() },
      { id: '2', codeHash: hashRecoveryCode(b!), usedAt: null },
    ];
    expect(matchRecoveryCodeHash(a!, rows)).toBeNull();
    expect(matchRecoveryCodeHash(b!, rows)).toBe('2');
    expect(matchRecoveryCodeHash('ZZZZ-ZZZZ', rows)).toBeNull();
  });
});
