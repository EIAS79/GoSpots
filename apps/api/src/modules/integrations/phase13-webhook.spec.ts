import { ForbiddenException } from '@nestjs/common';
import { ConnectorInstallationStatus } from '@prisma/client';
import { createHmac } from 'crypto';
import { IntegrationsService } from './integrations.service';

describe('Phase13 webhook signing contract', () => {
  function setup() {
    const prisma: any = {
      connectorInstallation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'install-1',
          shopId: 'shop-a',
          provider: 'demo',
          status: ConnectorInstallationStatus.ACTIVE,
          secretCiphertext: 'cipher',
          secretIv: 'iv',
          secretTag: 'tag',
          secretKeyVersion: 1,
        }),
      },
      webhookReceipt: {
        create: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
        findUnique: jest.fn(),
      },
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const audit = { record: jest.fn() } as any;
    const secretBox = {
      decrypt: jest.fn().mockReturnValue({ webhookSecret: 'inbound-secret' }),
      encrypt: jest.fn(),
    } as any;
    const registry = { get: jest.fn(), list: jest.fn().mockReturnValue([]) } as any;
    return { prisma, service: new IntegrationsService(prisma, flags, audit, secretBox, registry) };
  }

  it('accepts a correctly signed webhook and persists a replay receipt', async () => {
    const { prisma, service } = setup();
    const timestamp = Date.now().toString();
    const eventId = 'evt-1';
    const payload = { hello: 'world' };
    const signature = createHmac('sha256', 'inbound-secret')
      .update(`${timestamp}.${eventId}.${JSON.stringify(payload)}`)
      .digest('hex');
    await expect(service.receiveSignedWebhook({ installationId: 'install-1', eventId, timestamp, signature, payload }))
      .resolves.toEqual({ accepted: true, duplicate: false, receiptId: 'receipt-1' });
    expect(prisma.webhookReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shopId: 'shop-a', eventId, payloadHash: expect.any(String), signatureHash: expect.any(String) }),
    }));
  });

  it('rejects a tampered signature before writing a receipt', async () => {
    const { prisma, service } = setup();
    await expect(service.receiveSignedWebhook({
      installationId: 'install-1',
      eventId: 'evt-2',
      timestamp: Date.now().toString(),
      signature: '0'.repeat(64),
      payload: { hello: 'world' },
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.webhookReceipt.create).not.toHaveBeenCalled();
  });
});
