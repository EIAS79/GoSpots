import {
  assertGuestTokenActive,
  guestTokenHashesEqual,
  guestTokenLookupWhere,
  guestTokenNeedsRevoke,
  guestTokenPersistFields,
  guestTokenRevokeFields,
  hashGuestToken,
  issueGuestToken,
  verifyPresentedGuestToken,
  GUEST_TOKEN_DEFAULT_TTL_MS,
} from './guest-token.util';

describe('guest-token.util', () => {
  it('issues high-entropy raw token and matching hash', () => {
    const a = issueGuestToken();
    const b = issueGuestToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toBe(hashGuestToken(a.raw));
    expect(a.raw.length).toBeGreaterThanOrEqual(40);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('persists hash only (no plaintext)', () => {
    const issued = issueGuestToken();
    const data = guestTokenPersistFields(issued);
    expect(data.guestToken).toBeNull();
    expect(data.guestTokenHash).toBe(issued.hash);
    expect(data.guestTokenExpiresAt).toEqual(issued.expiresAt);
    expect(data.guestTokenRevokedAt).toBeNull();
  });

  it('accepts valid presented token against hash row', () => {
    const issued = issueGuestToken();
    const row = {
      guestToken: null,
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: null,
    };
    expect(verifyPresentedGuestToken(row, issued.raw)).toBe(true);
    expect(verifyPresentedGuestToken(row, 'wrong-token')).toBe(false);
  });

  it('dual-reads legacy plaintext rows', () => {
    const raw = 'legacy-plaintext-token-value';
    const row = {
      guestToken: raw,
      guestTokenHash: null,
      guestTokenExpiresAt: new Date(Date.now() + 60_000),
      guestTokenRevokedAt: null,
    };
    expect(verifyPresentedGuestToken(row, raw)).toBe(true);
    expect(verifyPresentedGuestToken(row, 'nope')).toBe(false);
  });

  it('prefers hash when both hash and legacy plaintext exist (post-backfill)', () => {
    const issued = issueGuestToken();
    const row = {
      guestToken: 'unrelated-legacy-value',
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: null,
    };
    expect(verifyPresentedGuestToken(row, issued.raw)).toBe(true);
    expect(verifyPresentedGuestToken(row, 'unrelated-legacy-value')).toBe(
      false,
    );
  });

  it('rejects empty or whitespace presented tokens', () => {
    const issued = issueGuestToken();
    const row = {
      guestToken: null,
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: null,
    };
    expect(verifyPresentedGuestToken(row, '')).toBe(false);
    expect(verifyPresentedGuestToken(row, '   ')).toBe(false);
  });

  it('lookup where uses hash and legacy plaintext OR', () => {
    const issued = issueGuestToken();
    const where = guestTokenLookupWhere('shop_1', issued.raw);
    expect(where.shopId).toBe('shop_1');
    expect(where.OR).toEqual([
      { guestTokenHash: issued.hash },
      { guestToken: issued.raw },
    ]);
  });

  it('timing-safe hash compare rejects unequal digests', () => {
    const h = hashGuestToken('abc');
    expect(guestTokenHashesEqual(h, h)).toBe(true);
    expect(guestTokenHashesEqual(h, hashGuestToken('xyz'))).toBe(false);
    expect(guestTokenHashesEqual(h, 'short')).toBe(false);
  });

  it('rejects expired tokens', () => {
    const issued = issueGuestToken({
      from: new Date(Date.now() - GUEST_TOKEN_DEFAULT_TTL_MS - 1000),
    });
    const row = {
      guestToken: null,
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: null,
    };
    expect(() => assertGuestTokenActive(row)).toThrow(/expired/i);
  });

  it('rejects revoked tokens', () => {
    const issued = issueGuestToken();
    const row = {
      guestToken: null,
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: new Date(),
    };
    expect(() => assertGuestTokenActive(row)).toThrow(/revoked/i);
  });

  it('revoke fields clear plaintext', () => {
    const data = guestTokenRevokeFields(new Date('2026-07-20T12:00:00Z'));
    expect(data.guestToken).toBeNull();
    expect(data.guestTokenRevokedAt?.toISOString()).toBe(
      '2026-07-20T12:00:00.000Z',
    );
  });

  it('allows active unexpired token', () => {
    const issued = issueGuestToken();
    expect(() =>
      assertGuestTokenActive({
        guestToken: null,
        guestTokenHash: issued.hash,
        guestTokenExpiresAt: issued.expiresAt,
        guestTokenRevokedAt: null,
      }),
    ).not.toThrow();
  });

  it('guestTokenNeedsRevoke is true until revokedAt is set', () => {
    expect(guestTokenNeedsRevoke({ guestTokenRevokedAt: null })).toBe(true);
    expect(
      guestTokenNeedsRevoke({ guestTokenRevokedAt: new Date() }),
    ).toBe(false);
  });

  it('dual-read legacy plaintext works until expiry, then refuse', () => {
    const raw = 'legacy-plaintext-still-valid';
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 1_000);
    const activeLegacy = {
      guestToken: raw,
      guestTokenHash: null as string | null,
      guestTokenExpiresAt: future,
      guestTokenRevokedAt: null as Date | null,
    };
    expect(verifyPresentedGuestToken(activeLegacy, raw)).toBe(true);
    expect(() => assertGuestTokenActive(activeLegacy)).not.toThrow();

    const expiredLegacy = { ...activeLegacy, guestTokenExpiresAt: past };
    expect(verifyPresentedGuestToken(expiredLegacy, raw)).toBe(true);
    expect(() => assertGuestTokenActive(expiredLegacy)).toThrow(/expired/i);
  });

  it('cancel revoke then assert refuses reuse (status/cancel gate)', () => {
    const issued = issueGuestToken();
    const row = {
      guestToken: issued.raw,
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: null as Date | null,
    };
    expect(verifyPresentedGuestToken(row, issued.raw)).toBe(true);
    expect(() => assertGuestTokenActive(row)).not.toThrow();

    const revoked = { ...row, ...guestTokenRevokeFields(new Date()) };
    expect(revoked.guestToken).toBeNull();
    expect(guestTokenNeedsRevoke(revoked)).toBe(false);
    // Hash still verifies (lookup can find the row) but active gate refuses.
    expect(verifyPresentedGuestToken(revoked, issued.raw)).toBe(true);
    expect(() => assertGuestTokenActive(revoked)).toThrow(/revoked/i);
  });

  it('expired hash token cannot pass cancel/status active gate', () => {
    const issued = issueGuestToken({
      from: new Date(Date.now() - GUEST_TOKEN_DEFAULT_TTL_MS - 5_000),
    });
    const row = {
      guestToken: null,
      guestTokenHash: issued.hash,
      guestTokenExpiresAt: issued.expiresAt,
      guestTokenRevokedAt: null,
    };
    expect(verifyPresentedGuestToken(row, issued.raw)).toBe(true);
    expect(() => assertGuestTokenActive(row)).toThrow(/expired/i);
  });
});
