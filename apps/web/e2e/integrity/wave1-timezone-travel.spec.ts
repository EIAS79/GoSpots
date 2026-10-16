import { expect, test } from '@playwright/test';
import { E2E, api, bindVenue, loginOwner } from '../helpers/app';

test.use({ timezoneId: 'America/Los_Angeles' });

test('@smoke W1 traveling cashier sees Warsaw booking day and wall clock while UTC remains canonical', async ({ page }) => {
  test.setTimeout(90_000);
  await loginOwner(page);
  await bindVenue(page, E2E.venues.gaming);
  const browserTimeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(browserTimeZone).toBe('America/Los_Angeles');

  const venueDay = '2027-06-02';
  const startsAt = '2027-06-02T16:30:00.000Z';
  const endsAt = '2027-06-02T17:00:00.000Z';
  // Disposable E2E venue has no default weekly hours; explicitly configure
  // an open calendar before asserting travel-zone booking behavior.
  await api(page, 'PUT', '/hours/weekly', {
    data: {
      days: Array.from({ length: 7 }, (_, weekday) => ({
        weekday, isClosed: false, opensAt: '00:00', closesAt: '23:59',
      })),
    },
  });
  const schedule = await api<any>(page, 'GET', `/reservations/schedule?date=${venueDay}`);
  const resources = schedule.categories.flatMap((category: any) => category.units ?? []);
  expect(resources.length).toBeGreaterThan(0);
  const availableUnit = resources.find((unit: any) =>
    !(unit.bookings ?? []).some((booking: any) =>
      booking.startsAt < endsAt && booking.endsAt > startsAt
    ),
  );
  expect(availableUnit, 'E2E needs a free venue unit at the chosen instant').toBeTruthy();
  const guest = `W1 Timezone Traveler ${Date.now()}`;
  const created = await api<any>(page, 'POST', '/reservations', {
    data: {
      guestName: guest,
      resourceId: availableUnit.id,
      startsAt,
      endsAt,
      partySize: 2,
    },
  });
  expect(created.startsAt).toBe(startsAt);
  expect(created.endsAt).toBe(endsAt);
  const refreshed = await api<any>(page, 'GET', `/reservations/schedule?date=${venueDay}`);
  const allBookings = refreshed.categories.flatMap((category: any) =>
    (category.units ?? []).flatMap((unit: any) => unit.bookings ?? []),
  );
  const persisted = allBookings.find((booking: any) => booking.id === created.id);
  expect(persisted).toBeTruthy();
  expect(persisted.startsAt).toBe(startsAt);

  await page.goto(`/dashboard/${E2E.venues.gaming}/sessions?tab=schedule&date=${venueDay}`);
  await expect(page.locator('input[type="date"]').first()).toHaveValue(venueDay);
  await expect(page.getByText(guest, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  // Browser device is 09:30 Los Angeles; venue display must show 18:30 Warsaw.
  await expect(page.getByText(/(06:30|6:30|18:30)/).first()).toBeVisible();
});
