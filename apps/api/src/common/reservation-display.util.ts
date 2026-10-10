/** Venue-authoritative human rendering, independent of the API machine timezone. */
function zoneOrUtc(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function reservationVenueDateKey(at: Date, timeZone: string): string {
  const fields = new Intl.DateTimeFormat('en-US', {
    timeZone: zoneOrUtc(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const value = (part: Intl.DateTimeFormatPartTypes) => fields.find((p) => p.type === part)?.value ?? '00';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function clock(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: '2-digit',
  }).format(at);
}

function offset(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'shortOffset',
  }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value ?? zone;
}

function range(startsAt: Date, endsAt: Date, zone: string): string {
  const start = clock(startsAt, zone);
  const end = clock(endsAt, zone);
  const before = offset(startsAt, zone);
  const after = offset(endsAt, zone);
  const endDay = reservationVenueDateKey(endsAt, zone);
  const startDay = reservationVenueDateKey(startsAt, zone);
  const dayLabel = endDay !== startDay ? `${endDay} ` : '';
  return before === after
    ? `${start}–${dayLabel}${end} ${before} (${zone})`
    : `${start} ${before}–${dayLabel}${end} ${after} (${zone})`;
}

export function formatReservationWindow(startsAt: Date, endsAt: Date, timeZone: string): string {
  const zone = zoneOrUtc(timeZone);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
  }).format(startsAt);
  return `${date} · ${range(startsAt, endsAt, zone)}`;
}

export function formatReservationEmailWhen(startsAt: Date, endsAt: Date, timeZone: string) {
  const zone = zoneOrUtc(timeZone);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(startsAt);
  return { date, range: range(startsAt, endsAt, zone) };
}
