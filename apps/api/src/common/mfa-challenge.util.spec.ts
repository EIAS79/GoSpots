import {
  isMfaChallengePayload,
  MFA_CHALLENGE_PURPOSE,
} from './mfa-challenge.util';

describe('mfa-challenge.util', () => {
  it('accepts valid challenge payloads', () => {
    expect(
      isMfaChallengePayload({
        sub: 'user_1',
        purpose: MFA_CHALLENGE_PURPOSE,
        acct: 'VENUE_OWNER',
      }),
    ).toBe(true);
  });

  it('rejects unrelated JWTs', () => {
    expect(isMfaChallengePayload(null)).toBe(false);
    expect(isMfaChallengePayload({ sub: 'x' })).toBe(false);
    expect(
      isMfaChallengePayload({ sub: 'x', purpose: 'access' }),
    ).toBe(false);
  });
});
