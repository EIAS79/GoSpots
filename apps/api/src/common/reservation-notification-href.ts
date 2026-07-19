export type ReservationNotificationTab = 'dining' | 'schedule' | 'events';

export function reservationSessionsHref(
  startsAt: Date,
  tab: ReservationNotificationTab,
): string {
  if (tab === 'events') return '/sessions?tab=events';
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}`;
  return `/sessions?tab=${tab}&date=${date}`;
}

export function reservationTabFromHref(
  href: string | null | undefined,
): ReservationNotificationTab {
  if (!href) return 'schedule';
  if (href.includes('tab=events')) return 'events';
  if (href.includes('tab=dining')) return 'dining';
  return 'schedule';
}

/** Maps unread reservation notifications to dining / gaming / events tabs. */
export function classifyReservationNotificationTab(input: {
  href: string | null;
  title: string;
}): ReservationNotificationTab | null {
  if (input.href?.includes('/sessions')) {
    return reservationTabFromHref(input.href);
  }

  const title = input.title.toLowerCase();
  if (title.includes('table') || title.includes('dining')) return 'dining';
  if (
    title.includes('gaming') ||
    title.includes('game booking') ||
    title.includes('booking starts') ||
    title.includes('booking is starting')
  ) {
    return 'schedule';
  }
  if (title.includes('event') && title.includes('request')) return 'events';

  return null;
}
