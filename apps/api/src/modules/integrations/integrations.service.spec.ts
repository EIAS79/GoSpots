import { BadRequestException } from '@nestjs/common';
import {
  ConnectorInstallationStatus,
  IntegrationDirection,
  IntegrationJobStatus,
} from '@prisma/client';
import { IntegrationsService } from './integrations.service';

describe('Integration platform reliability', () => {
  const actor = {
    sub: 'user-1',
    shopId: 'shop-1',
    shopRole: 'OWNER',
    perms: '*',
    email: 'owner@example.com',
  } as any;

  function setup() {
    const connector = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    const prisma: any = {
      connectorInstallation: { findFirst: jest.fn(), findUnique: jest.fn() },
      integrationJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      webhookDelivery: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      webhookEndpoint: { create: jest.fn(), findMany: jest.fn() },
      webhookReceipt: { create: jest.fn(), findUnique: jest.fn() },
      integrationCredential: { create: jest.fn(), updateMany: jest.fn() },
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const audit = { record: jest.fn() } as any;
    const secretBox = {
      encrypt: jest.fn(),
      decrypt: jest.fn().mockReturnValue({ webhookSecret: 'secret' }),
    } as any;
    const registry = {
      get: jest.fn().mockReturnValue(connector),
      list: jest.fn().mockReturnValue([]),
    } as any;
    const service = new IntegrationsService(
      prisma,
      flags,
      audit,
      secretBox,
      registry,
    );
    return { service, prisma, connector, secretBox, registry };
  }

  it('atomically claims a durable job before connector execution', async () => {
    const { service, prisma, connector } = setup();
    prisma.integrationJob.findMany.mockResolvedValue([{ id: 'job-1' }]);
    prisma.integrationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.integrationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      shopId: 'shop-1',
      installationId: 'install-1',
      jobType: 'session.charge',
      idempotencyKey: 'idem-1',
      payload: { amount: '10.00' },
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

    expect(prisma.integrationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1' }),
        data: expect.objectContaining({ status: IntegrationJobStatus.PROCESSING }),
      }),
    );
    expect(connector.execute).toHaveBeenCalledTimes(1);
    expect(prisma.integrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IntegrationJobStatus.SUCCEEDED,
          attemptCount: 1,
        }),
      }),
    );
  });

  it('does not execute when another worker wins the job claim', async () => {
    const { service, prisma, connector } = setup();
    prisma.integrationJob.findMany.mockResolvedValue([{ id: 'job-1' }]);
    prisma.integrationJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.webhookDelivery.findMany.mockResolvedValue([]);
    await service.processQueues();
    expect(connector.execute).not.toHaveBeenCalled();
  });

  it('blocks private webhook targets before persistence', async () => {
    const { service, prisma } = setup();
    await expect(
      service.createWebhookEndpoint(actor, {
        name: 'bad',
        url: 'https://127.0.0.1/hook',
        eventTypes: ['*'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it('enqueues only against an installation owned by the same shop', async () => {
    const { service, prisma } = setup();
    prisma.connectorInstallation.findFirst.mockResolvedValue(null);
    await expect(
      service.enqueueForShop(
        'shop-1',
        'foreign-install',
        {
          direction: IntegrationDirection.OUTBOUND,
          jobType: 'session.charge',
          idempotencyKey: 'idem-1',
          payload: {},
          maxAttempts: 3,
        },
        null,
      ),
    ).rejects.toThrow('Active connector installation not found');
    expect(prisma.integrationJob.create).not.toHaveBeenCalled();
  });
});
