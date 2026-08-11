import { calculateAccruedMinor } from './operations.service';

describe('Resource Engine 2.0 billing snapshot math', () => {
  const startedAt = new Date('2026-08-11T10:00:00.000Z');

  it('removes paused time and rounds billable minutes', () => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T11:10:00.000Z'),
      totalPausedSeconds: 10 * 60,
      hourlyRateMinor: 4000,
      roundingMinutes: 15,
      minimumMinutes: 0,
    })).toBe(4000);
  });

  it('preserves minimum and cap rules in the rate snapshot', () => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T10:02:00.000Z'),
      totalPausedSeconds: 0,
      hourlyRateMinor: 6000,
      roundingMinutes: 1,
      minimumMinutes: 30,
      capMinor: 2000,
    })).toBe(2000);
  });

  it('uses overtime rate only after the snapshotted threshold', () => {
    expect(calculateAccruedMinor({
      startedAt,
      endedAt: new Date('2026-08-11T12:00:00.000Z'),
      totalPausedSeconds: 0,
      hourlyRateMinor: 3000,
      overtimeRateMinor: 6000,
      overtimeAfterMinutes: 60,
      roundingMinutes: 1,
      minimumMinutes: 0,
    })).toBe(9000);
  });
});
