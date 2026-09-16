import {
  classifyWalkInBillingRow,
  computePlayBillingAmount,
} from './play-billing.util';

describe('computePlayBillingAmount proportional rates', () => {
  const start = new Date('2026-08-03T14:00:00.000Z');

  function endAfterMinutes(minutes: number) {
    return new Date(start.getTime() + minutes * 60_000);
  }

  it('pro-rates a 60-min $30 rate to $15 for 30 minutes', () => {
    const result = computePlayBillingAmount({
      startsAt: start,
      endsAt: endAfterMinutes(30),
      partySize: 1,
      hourlyRate: 0,
      slotMinutes: 60,
      categoryRates: [{ label: 'Hourly', durationMinutes: 60, price: 30 }],
    });
    expect(result.amount).toBe(15);
    expect(result.durationMinutes).toBe(30);
  });

  it('pro-rates 90 minutes of a 60-min $30 rate to $45', () => {
    const result = computePlayBillingAmount({
      startsAt: start,
      endsAt: endAfterMinutes(90),
      partySize: 1,
      hourlyRate: 0,
      slotMinutes: 60,
      categoryRates: [{ label: 'Hourly', durationMinutes: 60, price: 30 }],
    });
    expect(result.amount).toBe(45);
  });

  it('picks the cheapest among multiple rates', () => {
    const result = computePlayBillingAmount({
      startsAt: start,
      endsAt: endAfterMinutes(90),
      partySize: 1,
      hourlyRate: 0,
      slotMinutes: 60,
      categoryRates: [
        { label: 'Hourly', durationMinutes: 60, price: 30 },
        { label: '90 min pack', durationMinutes: 90, price: 40 },
      ],
    });
    expect(result.amount).toBe(40);
    expect(result.rateLabel).toBe('90 min pack');
  });

  it('falls back to hourlyRate when no category rates', () => {
    const result = computePlayBillingAmount({
      startsAt: start,
      endsAt: endAfterMinutes(30),
      partySize: 1,
      hourlyRate: 30,
      slotMinutes: 60,
      categoryRates: [],
    });
    expect(result.amount).toBe(15);
  });
});

describe('classifyWalkInBillingRow', () => {
  const now = new Date('2026-09-16T14:00:00.000Z');
  const startedAt = new Date('2026-09-16T12:00:00.000Z');

  it('keeps ACTIVE walk-ins in progress after planned duration until explicitly ended', () => {
    expect(
      classifyWalkInBillingRow(
        'ACTIVE',
        null,
        startedAt,
        null,
        60,
        now,
      ),
    ).toBe('in_progress');
  });

  it('moves an explicitly ended ACTIVE walk-in to awaiting payment', () => {
    expect(
      classifyWalkInBillingRow(
        'ACTIVE',
        null,
        startedAt,
        new Date('2026-09-16T13:15:00.000Z'),
        60,
        now,
      ),
    ).toBe('awaiting_payment');
  });

  it('classifies completed walk-ins as paid', () => {
    expect(
      classifyWalkInBillingRow(
        'COMPLETED',
        new Date('2026-09-16T13:20:00.000Z'),
        startedAt,
        new Date('2026-09-16T13:15:00.000Z'),
        60,
        now,
      ),
    ).toBe('paid');
  });

  it('ignores canceled walk-ins', () => {
    expect(
      classifyWalkInBillingRow('CANCELED', null, startedAt, null, 60, now),
    ).toBeNull();
  });
});
