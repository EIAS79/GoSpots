import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TicketingService } from './ticketing.service';

const actor = {
  sub: 'user-1',
  email: 'owner@example.com',
  shopId: 'shop-1',
  shopRole: 'OWNER',
} as any;

function buildService(prisma: any, customerValue: any = { storedValue: jest.fn() }) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'OPAQUE_IDENTIFIER_SECRET' ? 'phase11-test-secret' : undefined,
    ),
  } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return {
    service: new TicketingService(prisma, config, audit, customerValue),
    audit,
    customerValue,
  };
}

describe('TicketingService Phase 11', () => {
  it('rejects ticket fulfillment without a paid canonical settlement', async () => {
    const prisma = {
      checkSettlement: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const { service } = buildService(prisma);

    await expect(
      service.issueOrder(actor, {
        idempotencyKey: 'ticket-issue-1',
        settlementId: 'settlement-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires RFID/NFC/wristband credentials to trace to a canonical customer fact', async () => {
    const { service } = buildService({} as any);

    await expect(
      service.bindCredential(actor, {
        token: 'rfid-raw-1',
        type: 'RFID',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats a cross-tenant/unknown credential as denied without leaking it', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      accessZone: {
        findFirst: jest.fn().mockResolvedValue({ id: 'zone-1', shopId: 'shop-1', capacity: 20 }),
      },
      accessCredential: { findFirst: jest.fn().mockResolvedValue(null) },
      accessEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { occupancyDelta: 3 } }),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'event-1', ...data })),
      },
      domainEventOutbox: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    } as any;
    const prisma = {
      $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)),
    } as any;
    const { service } = buildService(prisma);

    const result = await service.scanAccess(actor, {
      token: 'belongs-to-another-shop',
      zoneId: 'zone-1',
      direction: 'ENTER',
      idempotencyKey: 'scan-cross-tenant',
    });

    expect(result.event.decision).toBe('DENIED');
    expect(result.event.reasonCode).toBe('UNKNOWN_CREDENTIAL');
    expect(result.event.credentialId).toBeNull();
  });

  it('rejects a scanner used against the wrong configured zone', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      accessZone: { findFirst: jest.fn().mockResolvedValue({ id: 'zone-1', shopId: 'shop-1' }) },
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'scanner-1' }) },
      accessScannerConfiguration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'config-1', zoneId: 'zone-2' }),
      },
    } as any;
    const prisma = { $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)) } as any;
    const { service } = buildService(prisma);

    await expect(
      service.scanAccess(actor, {
        token: 'token-1',
        zoneId: 'zone-1',
        direction: 'ENTER',
        scannerDeviceId: 'scanner-1',
        deviceSequence: 1,
        idempotencyKey: 'scan-wrong-zone',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects offline scanner replay when the scanner cache policy is disabled', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      accessZone: { findFirst: jest.fn().mockResolvedValue({ id: 'zone-1', shopId: 'shop-1' }) },
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'scanner-1' }) },
      accessScannerConfiguration: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'config-1',
          zoneId: 'zone-1',
          allowOfflineCache: false,
          enforceSequence: true,
        }),
      },
    } as any;
    const prisma = { $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)) } as any;
    const { service } = buildService(prisma);

    await expect(
      service.scanAccess(actor, {
        token: 'token-1',
        zoneId: 'zone-1',
        direction: 'ENTER',
        scannerDeviceId: 'scanner-1',
        deviceSequence: 1,
        offlineReplay: true,
        idempotencyKey: 'offline-replay-disabled',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('denies an expired credential without changing occupancy', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'credential-1' }]),
      accessZone: {
        findFirst: jest.fn().mockResolvedValue({ id: 'zone-1', shopId: 'shop-1', capacity: 10 }),
      },
      accessCredential: {
        findFirst: jest.fn().mockResolvedValue({ id: 'credential-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'credential-1',
          ticketId: null,
          membershipId: null,
          visitsUsed: 0,
          status: 'ACTIVE',
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      accessEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { occupancyDelta: 4 } }),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'event-expired', ...data })),
      },
      domainEventOutbox: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    } as any;
    const prisma = { $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)) } as any;
    const { service } = buildService(prisma);

    const result = await service.scanAccess(actor, {
      token: 'expired-token',
      zoneId: 'zone-1',
      direction: 'ENTER',
      idempotencyKey: 'scan-expired',
      occurredAt: '2026-08-18T12:00:00.000Z',
    });

    expect(result.event.decision).toBe('DENIED');
    expect(result.event.reasonCode).toBe('CREDENTIAL_EXPIRED');
    expect(result.occupancy).toBe(4);
  });

  it('delegates RFID stored-value spend to the Phase 9 canonical ledger service', async () => {
    const prisma = {
      accessCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'credential-1',
          storedValueAccountId: 'stored-1',
        }),
      },
      storedValueAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stored-1', shopId: 'shop-1', currency: 'PLN' }),
      },
    } as any;
    const customerValue = {
      storedValue: jest.fn().mockResolvedValue({ balanceMinor: 4000 }),
    } as any;
    const { service } = buildService(prisma, customerValue);

    await service.storedValueCredential(actor, {
      token: 'wristband-1',
      action: 'SPEND',
      amountMinor: 1000,
      idempotencyKey: 'wallet-spend-1',
    });

    expect(customerValue.storedValue).toHaveBeenCalledWith(
      actor,
      'stored-1',
      expect.objectContaining({
        type: 'REDEEM',
        amountMinor: 1000,
        correlationId: 'wallet-spend-1',
        sourceType: 'ACCESS_CREDENTIAL',
      }),
    );
    expect((prisma as any).rfidWallet).toBeUndefined();
  });

  it('records occupancy correction as an event delta and audit evidence', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      accessZone: { findFirst: jest.fn().mockResolvedValue({ id: 'zone-1', capacity: 20 }) },
      accessEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { occupancyDelta: 7 } }),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'correction-1', ...data })),
      },
      domainEventOutbox: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    } as any;
    const prisma = { $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)) } as any;
    const { service, audit } = buildService(prisma);

    const result = await service.correctOccupancy(actor, 'zone-1', {
      idempotencyKey: 'occupancy-fix-1',
      targetOccupancy: 5,
      reason: 'Two missing exits confirmed by supervisor',
    });

    expect(result.event.occupancyDelta).toBe(-2);
    expect(result.occupancy).toBe(5);
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'access.occupancy.correct' }),
    );
  });

  it('requires a reason for a manual locker override', async () => {
    const { service } = buildService({} as any);

    await expect(
      service.recordLockerEvent(actor, 'locker-1', {
        type: 'MANUAL_OVERRIDE',
        idempotencyKey: 'locker-override-1',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not reissue a redeemed ticket', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      ticket: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          shopId: 'shop-1',
          status: 'REDEEMED',
          version: 3,
        }),
      },
    } as any;
    const prisma = { $transaction: jest.fn(async (fn: (client: any) => unknown) => fn(tx)) } as any;
    const { service } = buildService(prisma);

    await expect(
      service.reissueTicket(actor, 'ticket-1', {
        idempotencyKey: 'reissue-1',
        reason: 'Lost ticket',
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
