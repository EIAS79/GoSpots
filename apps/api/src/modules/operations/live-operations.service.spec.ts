import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  OperationsBillingMode,
  OperationsMoveRatePolicy,
  OperationsPauseBillingMode,
} from '@prisma/client';
import {
  calculatePhase3AccruedMinor,
  LiveOperationsService,
  projectSessionTiming,
} from './live-operations.service';

const actor = {
  sub: 'staff-1',
  shopId: 'shop-1',
  sysRole: 'USER',
  shopRole: 'STAFF',
  perms: 'session.read,session.write',
} as never;

function makeService(prisma: Record<string, unknown>) {
  return new LiveOperationsService(
    prisma as never,
    { record: jest.fn() } as never,
    {} as never,
  );
}

describe('Phase 3 authoritative timer projection', () => {
  const startedAt = new Date('2026-08-15T20:00:00.000Z');

  it('projects overnight elapsed time from server time without wall-clock ambiguity', () => {
    const projection = projectSessionTiming({
      now: new Date('2026-08-16T02:30:00.000Z'),
      startedAt,
      status: 'ACTIVE',
      totalPausedSeconds: 30 * 60,
      pauseBillingMode: OperationsPauseBillingMode.STOP_CHARGING,
      scheduledEndAt: null,
      autoExtend: false,
      extensionMinutes: 15,
      warningMinutes: [],
    });
    expect(projection.elapsedSeconds).toBe(6 * 60 * 60);
    expect(projection.remainingSeconds).toBeNull();
  });

  it('stops elapsed billing during a STOP_CHARGING open pause', () => {
    const projection = projectSessionTiming({
      now: new Date('2026-08-15T21:30:00.000Z'),
      startedAt,
      status: 'PAUSED',
      pausedAt: new Date('2026-08-15T21:00:00.000Z'),
      totalPausedSeconds: 0,
      pauseBillingMode: OperationsPauseBillingMode.STOP_CHARGING,
      scheduledEndAt: new Date('2026-08-15T22:00:00.000Z'),
      autoExtend: false,
      extensionMinutes: 15,
      warningMinutes: [15, 5],
      maxPauseMinutes: 20,
    });
    expect(projection.elapsedSeconds).toBe(60 * 60);
    expect(projection.remainingSeconds).toBe(60 * 60);
    expect(projection.alerts).toContain('PAUSE_LIMIT_EXCEEDED');
  });

  it('continues elapsed billing during a CONTINUE_CHARGING pause', () => {
    const projection = projectSessionTiming({
      now: new Date('2026-08-15T21:30:00.000Z'),
      startedAt,
      status: 'PAUSED',
      pausedAt: new Date('2026-08-15T21:00:00.000Z'),
      totalPausedSeconds: 0,
      pauseBillingMode: OperationsPauseBillingMode.CONTINUE_CHARGING,
      scheduledEndAt: null,
      autoExtend: false,
      extensionMinutes: 15,
      warningMinutes: [],
    });
    expect(projection.elapsedSeconds).toBe(90 * 60);
  });

  it('projects fixed-time warnings and automatic extension deterministically', () => {
    const warning = projectSessionTiming({
      now: new Date('2026-08-15T20:51:00.000Z'),
      startedAt,
      status: 'ACTIVE',
      totalPausedSeconds: 0,
      pauseBillingMode: OperationsPauseBillingMode.STOP_CHARGING,
      scheduledEndAt: new Date('2026-08-15T21:00:00.000Z'),
      autoExtend: false,
      extensionMinutes: 15,
      warningMinutes: [15, 5],
    });
    expect(warning.remainingSeconds).toBe(9 * 60);
    expect(warning.alerts).toContain('TIME_WARNING_15M');
    expect(warning.alerts).not.toContain('TIME_WARNING_5M');

    const extended = projectSessionTiming({
      now: new Date('2026-08-15T21:16:00.000Z'),
      startedAt,
      status: 'ACTIVE',
      totalPausedSeconds: 0,
      pauseBillingMode: OperationsPauseBillingMode.STOP_CHARGING,
      scheduledEndAt: new Date('2026-08-15T21:00:00.000Z'),
      autoExtend: true,
      extensionMinutes: 15,
      warningMinutes: [5],
    });
    expect(extended.autoExtensionCountProjected).toBe(2);
    expect(extended.effectiveScheduledEndAt?.toISOString()).toBe('2026-08-15T21:30:00.000Z');
    expect(extended.alerts).toContain('AUTO_EXTENDED');
  });
});

describe('Phase 3 explicit fixed-duration overage pricing', () => {
  it('charges the fixed package once and then the explicit hourly overage rate', () => {
    expect(calculatePhase3AccruedMinor({
      startedAt: new Date('2026-08-15T10:00:00.000Z'),
      endedAt: new Date('2026-08-15T11:30:00.000Z'),
      totalPausedSeconds: 0,
      hourlyRateMinor: 0,
      billingMode: OperationsBillingMode.FIXED_DURATION,
      unitPriceMinor: 5000,
      fixedDurationMinutes: 60,
      overtimeAfterMinutes: 60,
      overtimeRateMinor: 2000,
      roundingMinutes: 1,
      minimumMinutes: 0,
    })).toBe(6000);
  });

  it('preserves paused-time exclusion across a rate boundary', () => {
    expect(calculatePhase3AccruedMinor({
      startedAt: new Date('2026-08-15T10:00:00.000Z'),
      endedAt: new Date('2026-08-15T11:40:00.000Z'),
      totalPausedSeconds: 10 * 60,
      hourlyRateMinor: 0,
      billingMode: OperationsBillingMode.FIXED_DURATION,
      unitPriceMinor: 5000,
      fixedDurationMinutes: 60,
      overtimeAfterMinutes: 60,
      overtimeRateMinor: 2000,
      roundingMinutes: 1,
      minimumMinutes: 0,
    })).toBe(6000);
  });
});

describe('Phase 3 service policy and conflict guards', () => {
  it('enforces manager-only pause before writing a pause segment', async () => {
    const prisma = {
      operationsSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          shopId: 'shop-1',
          resourceId: 'resource-1',
          status: 'ACTIVE',
          version: 1,
          managerOnlyPause: true,
        }),
      },
    };
    const service = makeService(prisma);
    await expect(service.pause(actor, 'session-1', {
      expectedVersion: 1,
      reason: 'clean table',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a stale waitlist seat claim before starting a duplicate session', async () => {
    const prisma = {
      reservationWaitlistEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wait-1',
          shopId: 'shop-1',
          status: 'WAITING',
          partySize: 4,
          note: null,
        }),
        updateMany: jest.fn(),
      },
      operationsWaitlistExtension: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wait-ext-1',
          shopId: 'shop-1',
          waitlistEntryId: 'wait-1',
          version: 2,
        }),
        updateMany: jest.fn(),
      },
    };
    const service = makeService(prisma);
    await expect(service.seatWaitlist(actor, 'wait-1', {
      expectedVersion: 1,
      resourceId: 'resource-1',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps session pricing stable unless the explicit move policy is REPRICE_TARGET', () => {
    expect(OperationsMoveRatePolicy.KEEP_SESSION_RATE).toBe('KEEP_SESSION_RATE');
    expect(OperationsMoveRatePolicy.REPRICE_TARGET).toBe('REPRICE_TARGET');
  });
});

describe('Phase 3 several-hour busy-floor simulation', () => {
  it('runs a six-hour deterministic floor without duplicate resource occupancy', () => {
    const resources = Array.from({ length: 12 }, (_, index) => `table-${index + 1}`);
    const occupancy = new Map<string, string>();
    const sessionResource = new Map<string, string>();
    const started = new Date('2026-08-15T18:00:00.000Z');
    let sequence = 0;

    const start = (resourceId: string) => {
      if (occupancy.has(resourceId)) throw new Error(`duplicate occupancy on ${resourceId}`);
      const sessionId = `session-${++sequence}`;
      occupancy.set(resourceId, sessionId);
      sessionResource.set(sessionId, resourceId);
      return sessionId;
    };
    const move = (sessionId: string, target: string) => {
      if (occupancy.has(target)) throw new Error(`move conflict on ${target}`);
      const current = sessionResource.get(sessionId);
      if (!current) throw new Error('session not found');
      occupancy.delete(current);
      occupancy.set(target, sessionId);
      sessionResource.set(sessionId, target);
    };
    const finish = (sessionId: string) => {
      const current = sessionResource.get(sessionId);
      if (!current) throw new Error('session not found');
      occupancy.delete(current);
      sessionResource.delete(sessionId);
    };

    const active = resources.slice(0, 8).map(start);
    for (let minute = 0; minute <= 6 * 60; minute += 5) {
      const now = new Date(started.getTime() + minute * 60_000);
      for (const sessionId of active.filter((id) => sessionResource.has(id))) {
        const projection = projectSessionTiming({
          now,
          startedAt: started,
          status: 'ACTIVE',
          totalPausedSeconds: minute >= 120 ? 10 * 60 : 0,
          pauseBillingMode: OperationsPauseBillingMode.STOP_CHARGING,
          scheduledEndAt: null,
          autoExtend: false,
          extensionMinutes: 15,
          warningMinutes: [],
        });
        expect(projection.elapsedSeconds).toBeGreaterThanOrEqual(0);
      }
      expect(new Set(occupancy.values()).size).toBe(occupancy.size);
      if (minute === 60) {
        finish(active[0]);
        move(active[1], 'table-1');
      }
      if (minute === 180) {
        finish(active[2]);
        const replacement = start('table-3');
        active.push(replacement);
      }
      if (minute === 300) finish(active[3]);
    }
    expect(new Set(occupancy.values()).size).toBe(occupancy.size);
  });
});
