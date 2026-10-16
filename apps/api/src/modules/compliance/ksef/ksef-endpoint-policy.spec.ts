import { resolveKsefEndpoint } from './ksef-endpoint-policy';

describe('KSeF sandbox endpoint policy', () => {
  it.each([
    ['TEST', 'https://api-test.ksef.mf.gov.pl/v2'],
    ['DEMO', 'https://api-demo.ksef.mf.gov.pl/v2'],
    ['PRD', 'https://api.ksef.mf.gov.pl/v2'],
  ])('uses %s official gateway', (env, baseUrl) => {
    expect(resolveKsefEndpoint(env).baseUrl).toBe(baseUrl);
  });
  it('rejects corrupt venue profiles rather than silently using TEST', () => {
    expect(() => resolveKsefEndpoint('unknown')).toThrow(/Unsupported/);
    expect(() => resolveKsefEndpoint('')).toThrow(/Unsupported/);
  });
  it('rejects a TEST venue routing to PRD', () => {
    expect(() =>
      resolveKsefEndpoint('TEST', 'https://api.ksef.mf.gov.pl/v2'),
    ).toThrow(/Cross-environment/);
  });
  it('rejects PRD routing to a sandbox endpoint', () => {
    expect(() =>
      resolveKsefEndpoint('PRD', 'https://api-demo.ksef.mf.gov.pl/v2'),
    ).toThrow(/Cross-environment/);
  });
  it.each([
    'http://api-test.ksef.mf.gov.pl/v2',
    'https://user:password@api-test.ksef.mf.gov.pl/v2',
    'https://api-test.ksef.mf.gov.pl/v2?accessToken=private',
    'https://api-test.ksef.mf.gov.pl/v2/invoices',
  ])('rejects unsafe endpoint override %s', (value) => {
    expect(() => resolveKsefEndpoint('TEST', value)).toThrow();
  });
  it('rejects unapproved HTTPS test proxies that could forward tokens to PRD', () => {
    expect(() =>
      resolveKsefEndpoint('TEST', 'https://sandbox-proxy.example.org/v2/'),
    ).toThrow(/Unapproved KSeF proxy/);
  });
});
