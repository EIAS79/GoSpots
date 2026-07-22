import {
  assertCriticalSecretsAtBoot,
  missingProductionSecrets,
} from './production-secrets.util';

describe('production-secrets.util', () => {
  const full = {
    get: (key: string) =>
      ({
        JWT_ACCESS_SECRET: 'jwt',
        DATABASE_URL: 'postgres://x',
        LEMON_SQUEEZY_WEBHOOK_SECRET: 'whsec',
      })[key],
  };

  it('missingProductionSecrets lists blank keys', () => {
    expect(
      missingProductionSecrets({
        get: (key) => (key === 'JWT_ACCESS_SECRET' ? 'x' : ''),
      }),
    ).toEqual(['DATABASE_URL', 'LEMON_SQUEEZY_WEBHOOK_SECRET']);
  });

  it('prod boot throws when any critical secret missing', () => {
    expect(() =>
      assertCriticalSecretsAtBoot(
        { get: () => undefined },
        { isProd: true },
      ),
    ).toThrow(/Missing required production secrets/);
  });

  it('prod boot succeeds when all secrets set', () => {
    expect(() =>
      assertCriticalSecretsAtBoot(full, { isProd: true }),
    ).not.toThrow();
  });

  it('non-prod warns on missing Lemon webhook secret and does not throw', () => {
    const warn = jest.fn();
    expect(() =>
      assertCriticalSecretsAtBoot(
        { get: (key) => (key === 'LEMON_SQUEEZY_WEBHOOK_SECRET' ? '' : 'x') },
        { isProd: false, warn },
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('LEMON_SQUEEZY_WEBHOOK_SECRET'),
    );
  });

  it('non-prod does not warn when Lemon webhook secret is set', () => {
    const warn = jest.fn();
    assertCriticalSecretsAtBoot(full, { isProd: false, warn });
    expect(warn).not.toHaveBeenCalled();
  });
});
