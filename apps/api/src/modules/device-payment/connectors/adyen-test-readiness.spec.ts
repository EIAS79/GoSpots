import { inspectAdyenTestReadiness } from './adyen-test-readiness';

const configured = {
  ADYEN_ENVIRONMENT: 'test',
  ADYEN_TERMINAL_ENABLED: 'true',
  ADYEN_MERCHANT_ACCOUNT: 'TestMerchant',
  ADYEN_API_KEY: 'secret-value-must-not-be-logged',
  ADYEN_STANDARD_WEBHOOK_HMAC_KEY: 'secret-value-must-not-be-logged',
};
describe('T-007 offline signed TEST terminal prerequisites', () => {
  it('reports a complete TEST configuration without exposing secrets', () => {
    const result = inspectAdyenTestReadiness(configured, 'TEST-POIID');
    expect(result).toEqual({
      ready: true,
      blockers: [],
      webhookPath: '/api/v1/payments/webhooks/adyen',
    });
    expect(JSON.stringify(result)).not.toContain(
      'secret-value-must-not-be-logged',
    );
  });
  it('refuses real-money LIVE routing in the test preflight', () => {
    const result = inspectAdyenTestReadiness(
      {
        ...configured,
        ADYEN_ENVIRONMENT: 'live',
        ADYEN_TERMINAL_BASE_URL: 'https://device-api-live.adyen.com/v1',
      },
      'TEST-POIID',
    );
    expect(result.ready).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/LIVE/);
  });
  it('requires merchant, keys, signed webhook and assigned terminal', () => {
    const result = inspectAdyenTestReadiness({ ADYEN_ENVIRONMENT: 'test' });
    expect(result.blockers.join(' ')).toContain('POIID');
    expect(result.blockers.join(' ')).toContain('ADYEN_API_KEY');
    expect(result.blockers.join(' ')).toContain(
      'ADYEN_STANDARD_WEBHOOK_HMAC_KEY',
    );
  });
  it.each([
    'http://device-api-test.adyen.com/v1',
    'https://u:p@device-api-test.adyen.com/v1',
    'https://device-api-live.adyen.com/v1',
    'https://unapproved-proxy.example.org/v1',
  ])('does not permit unsafe terminal URL %s', (url) => {
    expect(
      inspectAdyenTestReadiness(
        {
          ...configured,
          ADYEN_TERMINAL_BASE_URL: url,
        },
        'TEST-POIID',
      ).ready,
    ).toBe(false);
  });
  it('rejects an invalid SaleID before any hardware operations', () => {
    expect(
      inspectAdyenTestReadiness(
        {
          ...configured,
          ADYEN_TERMINAL_SALE_ID: 'too-long-hyphenated-sale-id',
        },
        'TEST-POIID',
      ).blockers.join(' '),
    ).toContain('SaleID');
  });
});
