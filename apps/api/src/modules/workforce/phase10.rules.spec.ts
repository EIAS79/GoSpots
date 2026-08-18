import {
  assertOperatorPinFormat,
  breakCompliance,
  classifyAccountableAction,
  computeSuspiciousReasons,
  isAfterHours,
  overtimeSeconds,
  scheduleStatus,
} from './phase10.rules';

describe('Phase 10 workforce accountability rules', () => {
  it('accepts short numeric PINs and rejects ambiguous PIN formats', () => {
    expect(assertOperatorPinFormat('1234')).toBe('1234');
    expect(assertOperatorPinFormat('12345678')).toBe('12345678');
    expect(() => assertOperatorPinFormat('123')).toThrow(/4 to 8 digits/);
    expect(() => assertOperatorPinFormat('12a4')).toThrow(/4 to 8 digits/);
  });

  it('classifies canonical successful and high-risk mutation routes', () => {
    expect(
      classifyAccountableAction(
        'POST',
        '/api/v1/workforce/adjustments/a1/decision',
        { approve: true },
      ),
    ).toMatchObject({ actionKind: 'MANUAL_TIME_EDIT' });
    expect(
      classifyAccountableAction('POST', '/api/v1/refunds', {
        amountMinor: 2500,
      }),
    ).toEqual({
      actionKind: 'REFUND',
      amountMinor: 2500,
      sourceType: 'refund',
    });
    expect(
      classifyAccountableAction(
        'POST',
        '/api/v1/checkout/settlements/s1/payments',
        { amountMinor: 9000 },
      ),
    ).toEqual({ actionKind: 'SALE', amountMinor: 9000, sourceType: 'sale' });
    expect(
      classifyAccountableAction('POST', '/api/v1/checkout/checks/c1/preview', {}),
    ).toBeNull();
    expect(
      classifyAccountableAction('POST', '/api/v1/checkout/checks/c1/settlements', {}),
    ).toBeNull();
    expect(
      classifyAccountableAction('POST', '/api/v1/inventory-v2/waste', {}),
    ).toMatchObject({ actionKind: 'INVENTORY_WRITE_OFF' });
    expect(
      classifyAccountableAction(
        'POST',
        '/api/v1/inventory-v2/stocktakes/st1/approve',
        {},
      ),
    ).toMatchObject({ actionKind: 'INVENTORY_CORRECTION' });
    expect(
      classifyAccountableAction(
        'POST',
        '/api/v1/inventory-v2/orders/o1/complete-with-approval',
        {},
      ),
    ).toMatchObject({ actionKind: 'INVENTORY_CORRECTION' });
    expect(
      classifyAccountableAction(
        'POST',
        '/api/v1/ordering/orders/o1/lines/l1/cancel',
        {},
      ),
    ).toMatchObject({ actionKind: 'VOID_AFTER_SEND' });
    expect(
      classifyAccountableAction('DELETE', '/api/v1/ordering/orders/o1', {}),
    ).toMatchObject({ actionKind: 'VOID_AFTER_SEND' });
    expect(
      classifyAccountableAction('POST', '/api/v1/cash/movements', {
        type: 'PAID_OUT',
      }),
    ).toMatchObject({ actionKind: 'CASH_PAYOUT' });
    expect(classifyAccountableAction('GET', '/api/v1/refunds')).toBeNull();
  });

  it('detects threshold, repetition, after-hours and manager-override signals', () => {
    expect(isAfterHours(23, 22, 6)).toBe(true);
    expect(isAfterHours(12, 22, 6)).toBe(false);
    expect(
      computeSuspiciousReasons({
        amountMinor: 10000,
        recentSameActorCount: 2,
        localHour: 23,
        managerOverride: true,
        rule: {
          amountThresholdMinor: 5000,
          repeatCountThreshold: 3,
          afterHoursStartHour: 22,
          afterHoursEndHour: 6,
        },
      }),
    ).toEqual([
      'AMOUNT_THRESHOLD',
      'REPEAT_THRESHOLD',
      'AFTER_HOURS',
      'MANAGER_OVERRIDE',
    ]);
  });

  it('calculates lateness, overtime visibility and break compliance deterministically', () => {
    const scheduledStart = new Date('2026-08-18T08:00:00.000Z');
    expect(
      scheduleStatus({
        scheduledStart,
        actualStart: new Date('2026-08-18T08:08:20.000Z'),
        lateGraceMinutes: 5,
      }),
    ).toEqual({ lateBySeconds: 200, late: true });
    expect(overtimeSeconds(43 * 3600, 40 * 3600)).toBe(3 * 3600);
    expect(
      breakCompliance({
        workedSeconds: 8 * 3600,
        unpaidBreakSeconds: 15 * 60,
        minimumBreakAfterSeconds: 6 * 3600,
        minimumBreakSeconds: 30 * 60,
      }),
    ).toEqual({
      required: true,
      compliant: false,
      missingSeconds: 15 * 60,
    });
  });
});
