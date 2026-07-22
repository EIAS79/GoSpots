/** Short-lived login MFA challenge JWT claims. */
export const MFA_CHALLENGE_PURPOSE = 'mfa_challenge' as const;
export const MFA_CHALLENGE_TTL_SEC = 5 * 60;

export type MfaChallengeJwtPayload = {
  sub: string;
  purpose: typeof MFA_CHALLENGE_PURPOSE;
  /** Bound login account type for audit / UI continuity. */
  acct?: string;
};

export function isMfaChallengePayload(
  value: unknown,
): value is MfaChallengeJwtPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === 'string' &&
    v.sub.length > 0 &&
    v.purpose === MFA_CHALLENGE_PURPOSE
  );
}
