import {
  buildNewDeviceSignInMail,
  isNewDeviceUserAgent,
  normalizeSessionUserAgent,
  SESSION_USER_AGENT_MAX,
} from './new-device-alert.util';

describe('new-device-alert.util', () => {
  describe('normalizeSessionUserAgent', () => {
    it('trims and truncates to session max', () => {
      expect(normalizeSessionUserAgent('  Chrome  ')).toBe('Chrome');
      const long = 'x'.repeat(SESSION_USER_AGENT_MAX + 40);
      expect(normalizeSessionUserAgent(long).length).toBe(
        SESSION_USER_AGENT_MAX,
      );
    });

    it('maps null/undefined to empty string', () => {
      expect(normalizeSessionUserAgent(null)).toBe('');
      expect(normalizeSessionUserAgent(undefined)).toBe('');
    });
  });

  describe('isNewDeviceUserAgent', () => {
    it('is true when there are no active session agents (first login)', () => {
      expect(isNewDeviceUserAgent('Mozilla/5.0', [])).toBe(true);
    });

    it('is true when incoming UA differs from all known agents', () => {
      expect(
        isNewDeviceUserAgent('Mozilla/5.0 Firefox', [
          'Mozilla/5.0 Chrome',
          'Safari',
        ]),
      ).toBe(true);
    });

    it('is false when an active session already has the same UA', () => {
      expect(
        isNewDeviceUserAgent('  Mozilla/5.0 Chrome  ', [
          'Safari',
          'Mozilla/5.0 Chrome',
        ]),
      ).toBe(false);
    });

    it('treats empty UA as matching other empty/null agents', () => {
      expect(isNewDeviceUserAgent(undefined, [null, ''])).toBe(false);
      expect(isNewDeviceUserAgent('Chrome', [null])).toBe(true);
    });
  });

  describe('buildNewDeviceSignInMail', () => {
    it('includes UA and ISO time', () => {
      const at = new Date('2026-07-21T10:15:00.000Z');
      const mail = buildNewDeviceSignInMail({
        userAgent: 'Mozilla/5.0',
        signedInAt: at,
      });
      expect(mail.subject).toMatch(/new sign-in/i);
      expect(mail.text).toContain('2026-07-21T10:15:00.000Z');
      expect(mail.text).toContain('Mozilla/5.0');
      expect(mail.html).toContain('Mozilla/5.0');
      expect(mail.html).toContain('2026-07-21T10:15:00.000Z');
    });

    it('escapes HTML in UA', () => {
      const mail = buildNewDeviceSignInMail({
        userAgent: '<script>x</script>',
        signedInAt: new Date('2026-07-21T00:00:00.000Z'),
      });
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).toContain('&lt;script&gt;');
    });
  });
});
