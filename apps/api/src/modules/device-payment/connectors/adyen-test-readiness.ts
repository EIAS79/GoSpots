/** Offline test-terminal preflight; does not contact Adyen or reveal secrets. */
export type AdyenTestReadiness = {
  ready: boolean;
  blockers: string[];
  webhookPath: '/api/v1/payments/webhooks/adyen';
};
export function inspectAdyenTestReadiness(
  env: Record<string, string | undefined>,
  terminalPoiId?: string,
): AdyenTestReadiness {
  const blockers: string[] = [];
  if (env.ADYEN_ENVIRONMENT?.trim().toLowerCase() !== 'test') {
    blockers.push('ADYEN_ENVIRONMENT must explicitly be test');
  }
  if (env.ADYEN_TERMINAL_ENABLED?.trim().toLowerCase() !== 'true') {
    blockers.push('ADYEN_TERMINAL_ENABLED must be true in TEST');
  }
  for (const key of [
    'ADYEN_MERCHANT_ACCOUNT',
    'ADYEN_API_KEY',
    'ADYEN_STANDARD_WEBHOOK_HMAC_KEY',
  ]) {
    if (!env[key]?.trim()) blockers.push(`Missing configuration: ${key}`);
  }
  if (!terminalPoiId?.trim())
    blockers.push('An assigned TEST terminal POIID is required');
  const saleId = env.ADYEN_TERMINAL_SALE_ID?.trim() || 'GoSpots';
  if (!/^[A-Za-z0-9]{1,10}$/.test(saleId))
    blockers.push('Invalid terminal SaleID');
  const override = env.ADYEN_TERMINAL_BASE_URL?.trim();
  if (override) {
    try {
      const url = new URL(override);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hostname !== 'device-api-test.adyen.com' ||
        !!url.port ||
        url.pathname.replace(/\/+$/, '') !== '/v1' ||
        url.search ||
        url.hash
      )
        blockers.push('Unsafe or LIVE test endpoint override');
    } catch {
      blockers.push('Malformed Adyen test endpoint override');
    }
  }
  return {
    ready: blockers.length === 0,
    blockers,
    webhookPath: '/api/v1/payments/webhooks/adyen',
  };
}
