import { expect, test } from '@playwright/test';
import { E2E, bindVenue, loginOwner } from '../helpers/app';

test('@smoke Phase 3 Offline Lite blocks checkout payment controls during WAN loss', async ({ page, context }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.offline);
  await page.goto(`/dashboard/${E2E.venues.offline}/checkout`);
  await expect(page.getByText(/Open checks|No open checks/).first()).toBeVisible();

  await context.setOffline(true);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Online only', { exact: true })).toBeVisible();
    await expect(page.getByText(/Payments and final checkout are disabled offline/i)).toBeVisible();
    for (const name of ['Cash', 'Card · external terminal', 'Split payment', 'Other received']) {
      await expect(page.getByRole('button', { name })).toBeDisabled();
    }
  } finally {
    await context.setOffline(false);
  }
});
