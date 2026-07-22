import {
  GUEST_GAMING_PHASE_LABELS,
  resolveGuestGamingPhase,
} from '../../common/guest-gaming-booking-status';

export type GamingReservationMailDetails = {
  guestName: string;
  venueName: string;
  categoryName: string;
  unitName: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  /** Present when the raw guest token is known (create / cancel with URL token). */
  statusUrl?: string | null;
  notes?: string | null;
  isDining?: boolean;
};

function bookingLabel(details: GamingReservationMailDetails) {
  return details.isDining ? 'table reservation' : 'gaming booking';
}

function formatWhen(startsAt: Date, endsAt: Date) {
  const date = startsAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const start = startsAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const end = endsAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return { date, start, end, range: `${start} – ${end}` };
}

function guestStatusLabel(details: GamingReservationMailDetails) {
  const phase = resolveGuestGamingPhase(
    details.status,
    details.startsAt,
    details.endsAt,
  );
  if (details.status === 'CANCELED' || details.status === 'NO_SHOW') {
    return GUEST_GAMING_PHASE_LABELS.canceled;
  }
  return GUEST_GAMING_PHASE_LABELS[phase];
}

export function gamingReservationSubject(
  venueName: string,
  kind: 'created' | 'confirmed' | 'canceled' | 'updated',
  isDining = false,
) {
  const label = isDining ? 'table reservation' : 'gaming booking';
  switch (kind) {
    case 'created':
      return `Your ${label} at ${venueName}`;
    case 'confirmed':
      return isDining
        ? `Table reservation confirmed — ${venueName}`
        : `Booking confirmed — ${venueName}`;
    case 'canceled':
      return isDining
        ? `Table reservation canceled — ${venueName}`
        : `Booking canceled — ${venueName}`;
    default:
      return isDining
        ? `Table reservation update — ${venueName}`
        : `Booking update — ${venueName}`;
  }
}

export function reservationEmailSubject(
  venueName: string,
  kind: 'created' | 'confirmed' | 'canceled' | 'updated',
  isDining = false,
) {
  return gamingReservationSubject(venueName, kind, isDining);
}

export function buildGamingReservationEmail(
  details: GamingReservationMailDetails,
  kind: 'created' | 'confirmed' | 'canceled' | 'updated',
) {
  const when = formatWhen(details.startsAt, details.endsAt);
  const statusLabel =
    kind === 'canceled'
      ? GUEST_GAMING_PHASE_LABELS.canceled
      : guestStatusLabel(details);

  const label = bookingLabel(details);
  const intro =
    kind === 'created' || kind === 'confirmed'
      ? `Hi ${details.guestName}, your ${label} at ${details.venueName} is confirmed.`
      : kind === 'canceled'
        ? `Hi ${details.guestName}, your ${label} at ${details.venueName} was canceled.`
        : `Hi ${details.guestName}, your ${label} at ${details.venueName} was updated.`;

  const unitWord = details.isDining ? 'Table' : 'Station';

  const text = [
    intro,
    '',
    `Venue: ${details.venueName}`,
    `Activity: ${details.categoryName}`,
    `${unitWord}: ${details.unitName}`,
    `Date: ${when.date}`,
    `Time: ${when.range}`,
    `Status: ${statusLabel}`,
    details.notes ? `Notes: ${details.notes}` : '',
    details.statusUrl ? '' : null,
    details.statusUrl ? `Track your booking: ${details.statusUrl}` : null,
    '',
    'If you have questions, contact the venue directly.',
  ]
    .filter((line): line is string => line != null && line !== '')
    .join('\n');

  const statusCta = details.statusUrl
    ? `<p style="margin:24px 0 0;text-align:center;">
            <a href="${escapeHtml(details.statusUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">View booking status</a>
          </p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#18181b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Locora booking</p>
          <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;">${details.venueName}</h1>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3f3f46;">${intro}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;">Reservation</p>
              <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#18181b;">${details.unitName}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#52525b;">${details.categoryName}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#52525b;">${when.date}</p>
              <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#b45309;">${when.range}</p>
              <p style="margin:0;font-size:13px;color:#52525b;">Status: <strong>${statusLabel}</strong></p>
              ${details.notes ? `<p style="margin:12px 0 0;font-size:13px;color:#71717a;">Notes: ${escapeHtml(details.notes)}</p>` : ''}
            </td></tr>
          </table>
          ${statusCta}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { text, html };
}

export function buildReservationEmail(
  details: GamingReservationMailDetails,
  kind: 'created' | 'confirmed' | 'canceled' | 'updated',
) {
  return buildGamingReservationEmail(details, kind);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
