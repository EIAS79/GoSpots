import { ConfigService } from '@nestjs/config';
import { ComplianceProfileService } from '../compliance-profile.service';
import { KsefCryptoService } from './ksef-crypto.service';
import { KsefClientService } from './ksef-client.service';

describe('KSeF interactive session close — local request adapter only', () => {
  function harness(closeStatus: number) {
    const paths: string[] = [];
    const config = {
      get: (key: string) => (key === 'KSEF_ENABLED' ? 'true' : undefined),
    } as unknown as ConfigService;
    const crypto = {
      createSessionMaterial: () => ({
        encryptedSymmetricKey: 'fake',
        initializationVector: 'fake',
        publicKeyId: 'test-key',
      }),
      encryptInvoice: () => ({
        invoiceHash: 'fake',
        invoiceSize: 4,
        encryptedInvoiceHash: 'fake',
        encryptedInvoiceSize: 4,
        encryptedInvoiceContent: 'fake',
      }),
    } as unknown as KsefCryptoService;
    const profiles = {} as ComplianceProfileService;
    const service = new KsefClientService(config, crypto, profiles);
    Object.defineProperty(service, 'context', {
      value: () => ({ baseUrl: 'https://api-test.ksef.mf.gov.pl/v2' }),
    });
    Object.defineProperty(service, 'publicKey', {
      value: () => ({ pem: 'fake-public-key', publicKeyId: 'test-key' }),
    });
    Object.defineProperty(service, 'request', {
      value: (_shop: string, path: string) => {
        paths.push(path);
        if (path === '/sessions/online')
          return Response.json({ referenceNumber: 'session-fixture' });
        if (path === '/sessions/online/session-fixture/invoices')
          return Response.json({ referenceNumber: 'invoice-fixture' });
        if (path === '/sessions/online/session-fixture/close')
          return new Response(
            closeStatus === 200 ? '{}' : '{"error":"temporary"}',
            {
              status: closeStatus,
              headers: { 'content-type': 'application/json' },
            },
          );
        throw new Error('Unexpected mock-only KSeF request path');
      },
    });
    return { service, paths };
  }

  it('closes the session after invoice submission before reporting SUBMITTED', async () => {
    const h = harness(200);
    const result = await h.service.submitOnlineInvoice('shop-a', '<Invoice/>');
    expect(result).toMatchObject({
      state: 'SUBMITTED',
      sessionReference: 'session-fixture',
      invoiceReference: 'invoice-fixture',
    });
    expect(h.paths).toEqual([
      '/sessions/online',
      '/sessions/online/session-fixture/invoices',
      '/sessions/online/session-fixture/close',
    ]);
  });

  it('preserves UNKNOWN and both references when close fails; never resubmits invoice', async () => {
    const h = harness(503);
    const result = await h.service.submitOnlineInvoice('shop-a', '<Invoice/>');
    expect(result).toMatchObject({
      state: 'UNKNOWN',
      sessionReference: 'session-fixture',
      invoiceReference: 'invoice-fixture',
      errorCode: 'KSEF_OUTCOME_UNKNOWN',
    });
    expect(h.paths).toEqual([
      '/sessions/online',
      '/sessions/online/session-fixture/invoices',
      '/sessions/online/session-fixture/close',
    ]);
    expect(h.paths.filter((p) => p.endsWith('/invoices'))).toHaveLength(1);
  });
  it('does not return SUBMITTED while awaiting an acknowledged session close', async () => {
    const h = harness(200);
    let closeStarted!: () => void;
    let acknowledgeClose!: () => void;
    const entered = new Promise<void>((resolve) => {
      closeStarted = resolve;
    });
    const closeAcknowledgement = new Promise<void>((resolve) => {
      acknowledgeClose = resolve;
    });
    const close = jest
      .spyOn(h.service, 'closeOnlineSession')
      .mockImplementation(async (_shopId, reference) => {
        expect(reference).toBe('session-fixture');
        closeStarted();
        await closeAcknowledgement;
      });
    let settled = false;
    const submitted = h.service
      .submitOnlineInvoice('shop-a', '<Invoice/>')
      .then((result) => {
        settled = true;
        return result;
      });
    await entered;
    expect(settled).toBe(false);
    expect(close).toHaveBeenCalledWith('shop-a', 'session-fixture');
    acknowledgeClose();
    expect(await submitted).toMatchObject({
      state: 'SUBMITTED',
      sessionReference: 'session-fixture',
      invoiceReference: 'invoice-fixture',
    });
    expect(h.paths.filter((path) => path.endsWith('/invoices'))).toHaveLength(
      1,
    );
  });

  it('preserves UNKNOWN and both references on an ambiguous timeout during close', async () => {
    const h = harness(200);
    const close = jest
      .spyOn(h.service, 'closeOnlineSession')
      .mockRejectedValue(new Error('simulated session-close timeout'));
    const result = await h.service.submitOnlineInvoice('shop-a', '<Invoice/>');
    expect(close).toHaveBeenCalledWith('shop-a', 'session-fixture');
    expect(result).toMatchObject({
      state: 'UNKNOWN',
      sessionReference: 'session-fixture',
      invoiceReference: 'invoice-fixture',
      errorCode: 'KSEF_OUTCOME_UNKNOWN',
    });
    expect(h.paths.filter((path) => path.endsWith('/invoices'))).toHaveLength(
      1,
    );
  });
});
