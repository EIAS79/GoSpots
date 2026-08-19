import { AutomationService } from './automation.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { evaluateAutomationCondition } from './automation-evaluator';

const actor = {
  sub: 'user-1',
  email: 'owner@example.com',
  shopId: 'shop-1',
  shopRole: 'OWNER',
} as any;

function service(prisma: any, enabled = true) {
  const notifications = { recordOperationsEvent: jest.fn() } as any;
  const mail = { enqueue: jest.fn() } as any;
  const capabilities = {
    snapshot: jest.fn().mockResolvedValue({ canUseAutomation: enabled }),
  } as any;
  return { service: new AutomationService(prisma, notifications, mail, capabilities), notifications, mail, capabilities };
}

describe('automation condition evaluator', () => {
  it('evaluates nested deterministic conditions', () => {
    const condition = {
      all: [
        { field: 'reservation.guests', op: 'gte', value: 6 },
        {
          any: [
            { field: 'reservation.vip', op: 'eq', value: true },
            { field: 'reservation.source', op: 'in', value: ['partner', 'concierge'] },
          ],
        },
      ],
    } as any;

    expect(evaluateAutomationCondition(condition, { reservation: { guests: 8, vip: false, source: 'partner' } })).toBe(true);
    expect(evaluateAutomationCondition(condition, { reservation: { guests: 4, vip: true, source: 'direct' } })).toBe(false);
  });

  it('supports explicit missing-value checks', () => {
    expect(evaluateAutomationCondition({ field: 'payload.optional', op: 'exists', value: false }, { payload: {} })).toBe(true);
  });
});

describe('AutomationService Phase 15', () => {
  it('publishes every required safe template and forbids high-risk autonomous actions', () => {
    const { service: instance } = service({} as any);
    const catalog = instance.templates();
    expect(catalog.templates).toHaveLength(11);
    expect(catalog.safeActionTypes).toEqual(expect.arrayContaining(['NOTIFICATION', 'TASK', 'ATTENTION', 'EMAIL', 'SMS', 'CUSTOMER_TAG', 'REPORT']));
    expect(catalog.forbiddenAutonomousActionTypes).toEqual(expect.arrayContaining(['REFUND', 'PRICE_UPDATE', 'CASH_ADJUST', 'STORED_VALUE_ADJUST', 'INVENTORY_CORRECTION', 'PERMISSION_CHANGE']));
  });

  it('rejects a stale automation rule update', async () => {
    const prisma = {
      automationRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-1', shopId: 'shop-1', version: 3 }),
        updateMany: jest.fn(),
      },
    } as any;
    const { service: instance } = service(prisma);
    await expect(instance.updateRule(actor, 'rule-1', { expectedVersion: 2, enabled: false })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.automationRule.updateMany).not.toHaveBeenCalled();
  });

  it('turns a concurrent unique-key collision into an idempotent replay', async () => {
    const replay = { id: 'execution-1', shopId: 'shop-1', dedupeKey: 'same-key', status: 'QUEUED' };
    const findUnique = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(replay);
    const prisma = {
      automationExecution: { findUnique, create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
      automationRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-1', shopId: 'shop-1', enabled: true, triggerType: 'MANUAL', conditionJson: null, actionsJson: '[{"type":"NOOP"}]' }),
      },
    } as any;
    const { service: instance } = service(prisma);
    const result = await instance.trigger(actor, 'rule-1', { dedupeKey: 'same-key', payload: { amount: 10 } } as any);
    expect(result).toEqual({ execution: replay, replayed: true });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects high-risk autonomous actions before persistence', async () => {
    const prisma = { automationRule: { create: jest.fn() } } as any;
    const { service: instance } = service(prisma);
    await expect(instance.createRule(actor, {
      name: 'unsafe refund',
      triggerType: 'DOMAIN_EVENT',
      actions: [{ type: 'REFUND' }],
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.automationRule.create).not.toHaveBeenCalled();
  });

  it('enforces automation capability in the service layer', async () => {
    const prisma = { automationRule: { findMany: jest.fn() } } as any;
    const { service: instance } = service(prisma, false);
    await expect(instance.list(actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
  });
});
