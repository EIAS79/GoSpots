import {
  DEV_DEFAULT_CORS_ORIGIN,
  isLocalhostOrigin,
  parseCorsOrigins,
  resolveCorsPolicy,
} from './cors-origins';

describe('parseCorsOrigins', () => {
  it('splits comma-separated values and strips trailing slashes', () => {
    expect(
      parseCorsOrigins('https://a.example/', 'https://b.example, http://localhost:3000/'),
    ).toEqual([
      'https://a.example',
      'https://b.example',
      'http://localhost:3000',
    ]);
  });

  it('dedupes and skips blanks', () => {
    expect(parseCorsOrigins('https://a.example', 'https://a.example/', '  ,  ')).toEqual([
      'https://a.example',
    ]);
  });
});

describe('isLocalhostOrigin', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'https://localhost',
  ])('detects %s', (o) => {
    expect(isLocalhostOrigin(o)).toBe(true);
  });

  it('rejects public hosts', () => {
    expect(isLocalhostOrigin('https://app.example.com')).toBe(false);
    expect(isLocalhostOrigin('https://preview-abc.vercel.app')).toBe(false);
  });
});

describe('resolveCorsPolicy', () => {
  it('non-prod defaults to localhost when allowlist empty', () => {
    const policy = resolveCorsPolicy({ isProd: false });
    expect(policy.origins).toEqual([DEV_DEFAULT_CORS_ORIGIN]);
    expect(policy.credentials).toBe(true);
  });

  it('non-prod keeps env allowlist (local web→api)', () => {
    const policy = resolveCorsPolicy({
      isProd: false,
      webOrigin: 'http://localhost:3000',
      corsOrigins: 'http://localhost:3000',
    });
    expect(policy.origins).toEqual(['http://localhost:3000']);
    expect(policy.credentials).toBe(true);
  });

  it('production uses explicit allowlist and enables credentials', () => {
    const policy = resolveCorsPolicy({
      isProd: true,
      corsOrigins: 'https://app.example.com, https://preview.vercel.app/',
    });
    expect(policy.origins).toEqual([
      'https://app.example.com',
      'https://preview.vercel.app',
    ]);
    expect(policy.credentials).toBe(true);
  });

  it('production strips localhost even if present in env', () => {
    const policy = resolveCorsPolicy({
      isProd: true,
      corsOrigin: 'https://app.example.com, http://localhost:3000',
      webOrigin: 'http://127.0.0.1:3000',
    });
    expect(policy.origins).toEqual(['https://app.example.com']);
    expect(policy.credentials).toBe(true);
  });

  it('production empty allowlist denies CORS (no reflection, no credentials)', () => {
    const policy = resolveCorsPolicy({ isProd: true });
    expect(policy.origins).toEqual([]);
    expect(policy.credentials).toBe(false);
  });

  it('merges CORS_ORIGINS, CORS_ORIGIN, WEB_ORIGIN, WEB_APP_URL', () => {
    const policy = resolveCorsPolicy({
      isProd: true,
      corsOrigins: 'https://a.example',
      corsOrigin: 'https://b.example',
      webOrigin: 'https://c.example',
      webAppUrl: 'https://d.example',
    });
    expect(policy.origins).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
      'https://d.example',
    ]);
  });
});
