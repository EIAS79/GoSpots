import { evaluateReliabilityConfig } from './reliability.config';

describe('evaluateReliabilityConfig', () => {
  it('reports a complete production configuration as ready', () => {
    const report = evaluateReliabilityConfig({
      nodeEnv: 'production',
      webAppUrl: 'https://www.gospots.eu',
      databaseUrl: 'postgresql://example',
      jwtSecret: 'jwt-secret',
      opaqueIdentifierSecret: 'opaque-secret',
      aiProvider: 'DETERMINISTIC',
    });

    expect(report.status).toBe('ok');
    expect(report.blocking).toEqual([]);
    expect(report.checks.webApp).toBe('ready');
    expect(report.checks.aiProvider).toBe('ready');
  });

  it('blocks unsafe production URLs and missing production secrets', () => {
    const report = evaluateReliabilityConfig({
      nodeEnv: 'production',
      webAppUrl: 'http://localhost:3000',
      databaseUrl: 'postgresql://example',
      jwtSecret: 'jwt-secret',
    });

    expect(report.status).toBe('degraded');
    expect(report.checks.webApp).toBe('invalid');
    expect(report.checks.opaqueIdentifiers).toBe('missing');
    expect(report.blocking).toEqual(expect.arrayContaining([
      'OPAQUE_IDENTIFIER_SECRET is required in production.',
      'WEB_APP_URL must be a public HTTPS URL in production.',
    ]));
  });

  it('requires both an HTTPS endpoint and key for an external AI provider', () => {
    const missingEndpoint = evaluateReliabilityConfig({
      databaseUrl: 'postgresql://example',
      jwtSecret: 'jwt-secret',
      aiProvider: 'EXTERNAL',
      aiApiKey: 'key',
    });
    expect(missingEndpoint.checks.aiProvider).toBe('missing');

    const ready = evaluateReliabilityConfig({
      databaseUrl: 'postgresql://example',
      jwtSecret: 'jwt-secret',
      aiProvider: 'EXTERNAL',
      aiEndpoint: 'https://ai.example.test/insights',
      aiApiKey: 'key',
    });
    expect(ready.checks.aiProvider).toBe('ready');
  });
});