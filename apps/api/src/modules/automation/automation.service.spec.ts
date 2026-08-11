import { AutomationService } from './automation.service';
import { evaluateAutomationCondition } from './automation-evaluator';

const actor = {
  sub: 'user-1',
  email: 'owner@example.com',
  shopId: 'shop-1',
  shopRole: 'OWNER',
} as any;

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

    expect(evaluateAutomationCondition(condition, {
      reservation: { guests: 8, vip: false, source: 'partner' },
    })).toBe(true);
    expect(evaluateAutomationCondition(condition, {
      reservation: { guests: 4, vip: true, source: 'direct' },
    })).toBe(false);
  });

  it('supports explicit missing-value checks', () => {
    expect(evaluateAutomationCondition(
      { field: 'payload.optional', op: 'exists', value: false },
      { payload: {} },
    )).toBe(true);
  });
});

describe('AutomationService', () => {
  it('turns a concurrent unique-key collision into an idempotent replay', async () => {
    const replay = { id: 'execution-1', shopId: 'shop-1', dedupeKey: 'same-key', status: 'QUEUED' };
    const findUnique = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay);
    const prisma = {
      automationExecution: {
        findUnique,
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      automationRule: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rule-1',
          shopId: 'shop-1',
          enabled: true,
          triggerType: 'MANUAL',
          conditionJson: null,
          actionsJson: '[{"type":"NOOP"}]',
        }),
      },
    } as any;
    const service = new AutomationService(prisma);

    const result = await service.trigger(actor, 'rule-1', {
      dedupeKey: 'same-key',
      payload: { amount: 10 },
    } as any);

    expect(result).toEqual({ execution: replay, replayed: true });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});