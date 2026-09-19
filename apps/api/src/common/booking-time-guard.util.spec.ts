import { BadRequestException } from '@nestjs/common';
import {
  assertBookingInstantNotPast,
  assertValidBookingInstant,
  floorToMinute,
} from './booking-time-guard.util';

describe('booking-time-guard', () => {
  const now = new Date('2026-09-19T09:30:45.000Z');

  it('floors the comparison clock to the current minute', () => {
    expect(floorToMinute(now).toISOString()).toBe('2026-09-19T09:30:00.000Z');
    expect(() =>
      assertBookingInstantNotPast(
        new Date('2026-09-19T09:30:00.000Z'),
        'Start',
        now,
      ),
    ).not.toThrow();
  });

  it('rejects an earlier day or minute', () => {
    expect(() =>
      assertBookingInstantNotPast(
        new Date('2026-09-19T09:29:59.000Z'),
        'Start',
        now,
      ),
    ).toThrow(new BadRequestException('Start time cannot be in the past.'));
  });

  it('rejects invalid date values', () => {
    expect(() =>
      assertValidBookingInstant(new Date('not-a-date'), 'End'),
    ).toThrow(new BadRequestException('Invalid end date/time.'));
  });
});
