import { buildReservationEmail } from './gaming-reservation-mail';

function reservation(startsAt: string, endsAt: string, timeZone: string) {
  return {
    guestName: 'Alex',
    venueName: 'GoSpots Warsaw',
    categoryName: 'Gaming',
    unitName: 'Table 3',
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    timeZone,
    status: 'CONFIRMED',
    isDining: false,
  };
}

describe('reservation mail uses the venue calendar rather than the mail worker locale', () => {
  it('renders matching Warsaw-local day and times in text and HTML around UTC midnight', () => {
    const mail = buildReservationEmail(
      reservation('2026-06-01T23:30:00Z', '2026-06-02T00:30:00Z', 'Europe/Warsaw'),
      'confirmed',
    );
    expect(mail.text).toContain('Date: Tuesday, June 2, 2026');
    expect(mail.text).toContain('1:30 AM');
    expect(mail.text).toContain('2:30 AM');
    expect(mail.text).toContain('GMT+2 (Europe/Warsaw)');
    expect(mail.html).toContain('June 2, 2026');
    expect(mail.html).toContain('Europe/Warsaw');
  });

  it('uses a different local calendar day for a booking at the same UTC instant in New York', () => {
    const mail = buildReservationEmail(
      reservation('2026-06-01T23:30:00Z', '2026-06-02T00:30:00Z', 'America/New_York'),
      'confirmed',
    );
    expect(mail.text).toContain('Date: Monday, June 1, 2026');
    expect(mail.text).toContain('7:30 PM');
    expect(mail.text).toContain('GMT-4 (America/New_York)');
  });

  it('distinguishes autumn repeated local clock time in the guest confirmation', () => {
    const mail = buildReservationEmail(
      reservation('2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', 'Europe/Warsaw'),
      'confirmed',
    );
    expect(mail.text).toContain('2:30 AM GMT+2');
    expect(mail.text).toContain('2:30 AM GMT+1');
    expect(mail.html).toContain('GMT+1');
  });

  it('does not claim a nonexistent time during the spring-forward gap', () => {
    const mail = buildReservationEmail(
      reservation('2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', 'Europe/Warsaw'),
      'confirmed',
    );
    expect(mail.text).toContain('1:30 AM GMT+1');
    expect(mail.text).toContain('3:30 AM GMT+2');
    expect(mail.text).not.toContain('2:30 AM');
  });

  it('retains the venue date and explicit zone in a canceled reservation email', () => {
    const mail = buildReservationEmail(
      { ...reservation('2026-06-01T23:30:00Z', '2026-06-02T00:30:00Z', 'Europe/Warsaw'), status: 'CANCELED' },
      'canceled',
    );
    expect(mail.text).toContain('was canceled');
    expect(mail.text).toContain('June 2, 2026');
    expect(mail.text).toContain('Europe/Warsaw');
  });
});
