import { computePlayBillingAmount } from './play-billing.util';

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
