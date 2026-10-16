import { createHash } from 'crypto';
import { collectRuntimeIdentity } from './runtime-identity-fingerprint';

describe('T-004 secret-free runtime identity capture', () => {
  it('produces comparable Neon and API host fingerprints without credentials', () => {
    const dbHost = 'ep-green-feather-al0r5imu.c-3.eu-central-1.aws.neon.tech';
    const identity = collectRuntimeIdentity({
      RENDER_SERVICE_ID: 'srv-test',
      RENDER_GIT_COMMIT: 'abcdef',
      DATABASE_URL: `postgresql://user:secret-password@${dbHost}/private`,
      API_PROXY_TARGET: 'https://gospots-api.onrender.com/api/v1',
      ADYEN_MERCHANT_ACCOUNT: 'PrivateMerchantName',
      ADYEN_ENVIRONMENT: 'test',
      KSEF_ENABLED: 'false',
    });
    expect(identity.databaseHostFingerprint).toBe(
      createHash('sha256').update(dbHost).digest('hex').slice(0, 16),
    );
    expect(identity.renderServiceId).toBe('srv-test');
    expect(identity.adyenEnvironment).toBe('test');
    const serialized = JSON.stringify(identity);
    expect(serialized).not.toMatch(
      /secret-password|user|PrivateMerchantName|\/private/,
    );
    expect(serialized).not.toContain('gospots-api.onrender.com');
  });
  it('never throws or prints full values for missing/malformed connections', () => {
    expect(
      collectRuntimeIdentity({
        DATABASE_URL: 'not a URL',
        ADYEN_ENVIRONMENT: 'LIVE',
      }),
    ).toMatchObject({
      databaseHostFingerprint: null,
      adyenEnvironment: 'live',
      adyenMerchantFingerprint: null,
    });
  });
  it('handles completely unconfigured deployments without guessing mappings', () => {
    expect(collectRuntimeIdentity({})).toMatchObject({
      renderServiceId: null,
      databaseHostFingerprint: null,
      apiTargetHostFingerprint: null,
      gitCommit: null,
    });
  });
});
