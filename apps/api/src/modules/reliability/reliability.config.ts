export type ReliabilityConfigInput = {
  nodeEnv?: string;
  webAppUrl?: string;
  databaseUrl?: string;
  jwtSecret?: string;
  opaqueIdentifierSecret?: string;
  aiProvider?: string;
  aiEndpoint?: string;
  aiApiKey?: string;
};

export type ReliabilityConfigReport = {
  production: boolean;
  status: 'ok' | 'degraded';
  checks: Record<string, 'ready' | 'optional' | 'missing' | 'invalid'>;
  blocking: string[];
  warnings: string[];
};

export function evaluateReliabilityConfig(input: ReliabilityConfigInput): ReliabilityConfigReport {
  const production = input.nodeEnv === 'production';
  const checks: ReliabilityConfigReport['checks'] = {};
  const blocking: string[] = [];
  const warnings: string[] = [];

  checks.database = input.databaseUrl?.trim() ? 'ready' : 'missing';
  if (!input.databaseUrl?.trim()) blocking.push('DATABASE_URL is required.');

  checks.jwt = input.jwtSecret?.trim() ? 'ready' : 'missing';
  if (!input.jwtSecret?.trim()) blocking.push('JWT_SECRET is required.');

  checks.opaqueIdentifiers = input.opaqueIdentifierSecret?.trim() ? 'ready' : 'missing';
  if (!input.opaqueIdentifierSecret?.trim()) {
    if (production) blocking.push('OPAQUE_IDENTIFIER_SECRET is required in production.');
    else warnings.push('OPAQUE_IDENTIFIER_SECRET is not set; ticketing can fall back to JWT_SECRET outside production.');
  }

  if (input.webAppUrl?.trim()) {
    try {
      const parsed = new URL(input.webAppUrl);
      const valid = parsed.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname);
      checks.webApp = valid ? 'ready' : 'invalid';
      if (production && !valid) blocking.push('WEB_APP_URL must be a public HTTPS URL in production.');
    } catch {
      checks.webApp = 'invalid';
      if (production) blocking.push('WEB_APP_URL is invalid.');
    }
  } else {
    checks.webApp = production ? 'missing' : 'optional';
    if (production) blocking.push('WEB_APP_URL is required in production.');
  }

  const provider = (input.aiProvider ?? 'DETERMINISTIC').toUpperCase();
  if (provider === 'DETERMINISTIC' || provider === 'LOCAL') {
    checks.aiProvider = 'ready';
  } else {
    let endpointValid = false;
    if (input.aiEndpoint?.trim()) {
      try {
        const parsed = new URL(input.aiEndpoint);
        endpointValid = parsed.protocol === 'https:';
      } catch {
        endpointValid = false;
      }
    }
    const hasKey = Boolean(input.aiApiKey?.trim());
    if (endpointValid && hasKey) {
      checks.aiProvider = 'ready';
    } else {
      checks.aiProvider = input.aiEndpoint?.trim() && !endpointValid ? 'invalid' : 'missing';
      const missing = [
        endpointValid ? null : 'a valid HTTPS AI_INSIGHTS_ENDPOINT',
        hasKey ? null : 'AI_INSIGHTS_API_KEY',
      ].filter(Boolean).join(' and ');
      warnings.push(`AI provider ${provider} is missing ${missing}; deterministic fallback will be used.`);
    }
  }

  return {
    production,
    status: blocking.length ? 'degraded' : 'ok',
    checks,
    blocking,
    warnings,
  };
}