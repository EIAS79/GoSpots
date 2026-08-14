import { ConnectorInstallationStatus, IntegrationDirection, IntegrationJobStatus } from '@prisma/client';
import { IntegrationsService } from './integrations.service';

describe('Integration platform queue reliability', () => {
  function setup() {
    const connector = { execute: jest.fn().mockResolvedValue({ externalId: 'demo:1' }) };
    const prisma: any = {
      connectorInstallation: { findFirst: jest.fn() },
      integrationJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      webhookDelivery: { findMany: jest.fn() },
    };
    const service = new IntegrationsService(
      prisma,
      { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any,
      { record: jest.fn() } as any,
      { encrypt: jest.fn(), decrypt: jest.fn() } as any,
      { get: jest.fn().mockReturnValue(connector), list: jest.fn().mockReturnValue([]) } as any,
    );
    return { service, prisma, connector };
  }

  it('claims a durable integration job before connector execution', async () => {
    const { service, prisma, connector } = setup();
    prisma.integrationJob.findMany.mockResolvedValue([{ id: 'job-1' }]);
    prisma.integrationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.integrationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      shopId: 'shop-1',
      installationId: 'install-1',
      jobType: 'catalog.sync',
      idempotencyKey: 'idem-1',
      payload: {},
      correlationId: null,
      attemptCount: 0,
      maxAttempts: 5,
      installation: {
        id: 'install-1',
        provider: 'demo',
        status: ConnectorInstallationStatus.ACTIVE,
        config: null,
      },
    });
    prisma.integrationJob.update.mockResolvedValue({});
    prisma.webhookDelivery.findMany.mockResolvedValue([]);

    await service.processQueues();

    expect(connector.execute).toHaveBeenCalledTimes(1);
    expect(prisma.integrationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: IntegrationJobStatus.SUCCEEDED, attemptCount: 1 }),
    }));
  });

  it('does not execute when another worker owns the claim', async () => {
    const { service, prisma, connector } = setup();
    prisma.integrationJob.findMany.mockResolvedValue([{ id: 'job-1' }]);
    prisma.integrationJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.webhookDelivery.findMany.mockResolvedValue([]);

    await service.processQueues();

    expect(connector.execute).not.toHaveBeenCalled();
  });

  it('rejects enqueue when the installation is outside the shop', async () => {
    const { service, prisma } = setup();
    prisma.connectorInstallation.findFirst.mockResolvedValue(null);

    await expect(service.enqueueForShop('shop-1', 'other-install', {
      direction: IntegrationDirection.OUTBOUND,
      jobType: 'catalog.sync',
      idempotencyKey: 'idem-1',
      payload: {},
      maxAttempts: 3,
    }, null)).rejects.toThrow('Active connector installation not found');

    expect(prisma.integrationJob.create).not.toHaveBeenCalled();
  });
});
