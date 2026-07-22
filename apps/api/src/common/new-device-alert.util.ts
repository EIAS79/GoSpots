/**
 * New-device / new-UA sign-in detection (bible #18 slice).
 * Compare the login User-Agent to active AuthSession.userAgent values
 * (same 200-char truncate as issueTokens). No 2FA.
 */

export const SESSION_USER_AGENT_MAX = 200;

export function normalizeSessionUserAgent(
  ua?: string | null,
): string {
  return (ua ?? '').trim().slice(0, SESSION_USER_AGENT_MAX);
}

/**
 * True when there are no active sessions, or none share the incoming UA
 * (including first login and first login from a new UA).
 */
export function isNewDeviceUserAgent(
  incomingUa: string | null | undefined,
  knownAgents: Array<string | null | undefined>,
): boolean {
  const incoming = normalizeSessionUserAgent(incomingUa);
  if (knownAgents.length === 0) return true;
  return !knownAgents.some(
    (a) => normalizeSessionUserAgent(a) === incoming,
  );
}

export function buildNewDeviceSignInMail(input: {
  userAgent: string;
  signedInAt: Date;
}): { subject: string; text: string; html: string } {
  const ua =
    normalizeSessionUserAgent(input.userAgent) || '(unknown device)';
  const when = input.signedInAt.toISOString();
  const subject = 'New sign-in to your GoSpots account';
  const text = [
    'We noticed a new sign-in to your GoSpots account.',
    '',
    `Time (UTC): ${when}`,
    `Browser / device: ${ua}`,
    '',
    'If this was you, you can ignore this email.',
    'If you did not sign in, revoke other sessions in Settings → Sessions and change your password.',
  ].join('\n');
  const html = [
    '<p>We noticed a <strong>new sign-in</strong> to your GoSpots account.</p>',
    `<p><strong>Time (UTC):</strong> ${escapeHtml(when)}<br/>`,
    `<strong>Browser / device:</strong> ${escapeHtml(ua)}</p>`,
    '<p>If this was you, you can ignore this email.</p>',
    '<p>If you did not sign in, revoke other sessions in Settings → Sessions and change your password.</p>',
  ].join('');
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
