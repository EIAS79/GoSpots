import {
  formatReservationWindow,
  formatReservationEmailWhen,
  reservationVenueDateKey,
} from './reservation-display.util';

describe('reservation venue-time rendering', () => {
  it('uses the venue day across UTC midnight even if the server is in another timezone', () => {
    const startsAt = new Date('2026-06-01T23:30:00Z');
    const endsAt = new Date('2026-06-02T00:30:00Z');
    expect(reservationVenueDateKey(startsAt, 'Europe/Warsaw')).toBe('2026-06-02');
    expect(reservationVenueDateKey(startsAt, 'America/New_York')).toBe('2026-06-01');
    const label = formatReservationWindow(startsAt, endsAt, 'Europe/Warsaw');
    expect(label).toContain('Jun 2');
    expect(label).toContain('1:30 AM');
    expect(label).toContain('Europe/Warsaw');
  });

  it('distinguishes repeated wall-clock hours when autumn DST ends', () => {
    const startsAt = new Date('2026-10-25T00:30:00Z');
    const endsAt = new Date('2026-10-25T01:30:00Z');
    const label = formatReservationWindow(startsAt, endsAt, 'Europe/Warsaw');
    expect(label).toContain('2:30 AM GMT+2');
    expect(label).toContain('2:30 AM GMT+1');
    expect(formatReservationEmailWhen(startsAt, endsAt, 'Europe/Warsaw').range).toContain('GMT+1');
  });

  it('uses spring-forward wall clock rather than inventing nonexistent 02:30', () => {
    const label = formatReservationWindow(
      new Date('2026-03-29T00:30:00Z'),
      new Date('2026-03-29T01:30:00Z'),
      'Europe/Warsaw',
    );
    expect(label).toContain('1:30 AM GMT+1');
    expect(label).toContain('3:30 AM GMT+2');
  });

  it('falls back to UTC for invalid zone rather than reading the host timezone', () => {
    expect(reservationVenueDateKey(new Date('2026-06-01T23:30:00Z'), 'Bad/Invalid'))
      .toBe('2026-06-01');
  });
});
