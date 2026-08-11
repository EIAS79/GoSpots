import { ConflictException } from '@nestjs/common';
import { EventsGrowthService } from './events-growth.service';

const actor = { sub: 'user-1', shopId: 'shop-1' } as any;

function makeService(prismaOverrides: Record<string, any> = {}) {
  const prisma: any = {
    eventProposal: {},
    eventResourceHold: {},
    eventPaymentSchedule: {},
    eventChecklistItem: {},
    eventExecution: {},
    eventLifecycleEvent: {},
    guestCheck: {},
    ledgerEntry: {},
    stockMovement: {},
    timePunch: {},
    shop: {},
    ...prismaOverrides,
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const capacity = {} as any;
  const guestChecks = {} as any;
  const service = new EventsGrowthService(prisma, audit, capacity, guestChecks);
  return { service, prisma, audit };
}

describe('EventsGrowthService lifecycle gates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('serializes proposal versions inside the event proposal advisory lock', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      eventProposal: {
        findFirst: jest.fn().mockResolvedValue({ version: 3 }),
        create: jest.fn().mockResolvedValue({
          id: 'proposal-4',
          eventRequestId: 'event-1',
          version: 4,
          subtotalMinor: 10000,
          depositMinor: 2000,
        }),
      },
    };
    const { service } = makeService({
      shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'EUR' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    });
    jest.spyOn(service as any, 'requireEvent').mockResolvedValue({ id: 'event-1' });
    jest.spyOn(service as any, 'currentState').mockResolvedValue('QUOTED');

    const proposal = await service.createProposal(actor, 'event-1', {
      name: 'ignored by service',
      subtotalMinor: 10000,
      depositMinor: 2000,
      terms: {},
    } as any);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.eventProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4 }),
      }),
    );
    expect(proposal.version).toBe(4);
  });

  it('blocks service close while checklist work is still open', async () => {
    const { service } = makeService({
      eventChecklistItem: { count: jest.fn().mockResolvedValue(2) },
    });
    jest.spyOn(service as any, 'currentState').mockResolvedValue('IN_PROGRESS');

    await expect(service.moveToFinalPayment(actor, 'event-1')).rejects.toThrow(
      '2 event checklist item(s) are still open.',
    );
  });

  it('hard-blocks completion until the event GuestCheck is settled', async () => {
    const { service } = makeService({
      eventExecution: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'execution-1',
          guestCheckId: 'check-1',
        }),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({ id: 'check-1', status: 'OPEN' }),
      },
    });
    jest.spyOn(service as any, 'currentState').mockResolvedValue('FINAL_PAYMENT');

    await expect(
      service.finishExecution(actor, 'event-1', 'COMPLETED'),
    ).rejects.toThrow('Final event GuestCheck must be SETTLED before completion.');
  });

  it('hard-blocks completion while due payment milestones remain unpaid', async () => {
    const { service } = makeService({
      eventExecution: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'execution-1',
          guestCheckId: 'check-1',
        }),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({ id: 'check-1', status: 'SETTLED' }),
      },
      eventPaymentSchedule: { count: jest.fn().mockResolvedValue(1) },
    });
    jest.spyOn(service as any, 'currentState').mockResolvedValue('FINAL_PAYMENT');

    await expect(
      service.finishExecution(actor, 'event-1', 'COMPLETED'),
    ).rejects.toThrow('1 due event payment milestone(s) remain unpaid.');
  });

  it('completes only after settlement gates and returns reconciled profitability', async () => {
    const execution = {
      id: 'execution-1',
      guestCheckId: 'check-1',
      status: 'IN_PROGRESS',
    };
    const updated = { ...execution, status: 'COMPLETED' };
    const { service, prisma } = makeService({
      eventExecution: {
        findFirst: jest.fn().mockResolvedValue(execution),
        update: jest.fn().mockResolvedValue(updated),
      },
      guestCheck: {
        findFirst: jest.fn().mockResolvedValue({ id: 'check-1', status: 'SETTLED' }),
      },
      eventPaymentSchedule: { count: jest.fn().mockResolvedValue(0) },
    });
    jest
      .spyOn(service as any, 'currentState')
      .mockResolvedValueOnce('FINAL_PAYMENT')
      .mockResolvedValueOnce('COMPLETED');
    jest.spyOn(service as any, 'profitabilityForShop').mockResolvedValue({
      recognizedRevenueMinor: 12000,
      inventoryCostMinor: 2500,
      laborCostMinor: 1500,
      contributionMinor: 8000,
    });

    const result = await service.finishExecution(actor, 'event-1', 'COMPLETED');

    expect(prisma.eventExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'execution-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(result.profitability).toEqual(
      expect.objectContaining({ contributionMinor: 8000 }),
    );
  });

  it('releases temporary holds when an event is canceled', async () => {
    const execution = { id: 'execution-1', status: 'IN_PROGRESS' };
    const { service, prisma } = makeService({
      eventExecution: {
        findFirst: jest.fn().mockResolvedValue(execution),
        update: jest.fn().mockResolvedValue({ ...execution, status: 'CANCELED' }),
      },
      eventResourceHold: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    });
    jest
      .spyOn(service as any, 'currentState')
      .mockResolvedValueOnce('IN_PROGRESS')
      .mockResolvedValueOnce('CANCELED');
    jest.spyOn(service as any, 'profitabilityForShop').mockResolvedValue({
      contributionMinor: 0,
    });

    await service.finishExecution(actor, 'event-1', 'CANCELED');

    expect(prisma.eventResourceHold.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', eventRequestId: 'event-1', status: 'HOLD' },
      data: { status: 'RELEASED' },
    });
  });

  it('expires stale holds and rolls HOLD back to QUOTED when no active hold remains', async () => {
    const stale = [
      {
        id: 'hold-1',
        eventRequestId: 'event-1',
      },
    ];
    const tx: any = {
      eventResourceHold: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      eventLifecycleEvent: {
        findFirst: jest.fn().mockResolvedValue({ toState: 'HOLD' }),
        create: jest.fn().mockResolvedValue({ id: 'life-2' }),
      },
    };
    const { service } = makeService({
      eventResourceHold: { findMany: jest.fn().mockResolvedValue(stale) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    });

    const result = await service.expireHolds('shop-1', new Date('2026-08-11T10:00:00Z'));

    expect(result).toEqual({ expired: 1 });
    expect(tx.eventLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromState: 'HOLD',
          toState: 'QUOTED',
        }),
      }),
    );
  });
});
