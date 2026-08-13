import { expect, test } from '@playwright/test';
import { E2E, api, bindVenue, completeLegacyOrder, createGuestCheckFromUi, loginOwner } from '../helpers/app';

test('@smoke offline financial controls require connectivity', async ({ page, context }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.offline);
  const label = `Phase3 Finance ${Date.now()}`;
  const check = await createGuestCheckFromUi(page, E2E.venues.offline, label);
  await completeLegacyOrder(page, check.id, 'e2e-item-offline', `Phase3 Order ${Date.now()}`);
  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, { data: {} });
  expect(Number(preview.amountDue)).toBeGreaterThan(0);
  await api(page, 'POST', `/checkout/checks/${check.id}/settlements`, {
    data: { expectedVersion: preview.checkVersion },
    idempotencyKey: `${check.id}-phase3-settlement`,
  });
  await page.goto(`/dashboard/${E2E.venues.offline}/checkout`);
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await expect(page.getByText('Bill final', { exact: true })).toBeVisible({ timeout: 15_000 });
  const names = ['Cash', 'Card · external terminal', 'Split payment', 'Other received'];
  for (const name of names) await expect(page.getByRole('button', { name })).toBeEnabled();
  await context.setOffline(true);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Online only', { exact: true })).toBeVisible();
    for (const name of names) await expect(page.getByRole('button', { name })).toBeDisabled();
  } finally {
    await context.setOffline(false);
  }
});
