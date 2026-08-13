import { expect, test } from '@playwright/test';
import { E2E, api, bindVenue, loginOwner } from '../helpers/app';

test('@smoke E2E-04 Offline Lite survives refresh and replays once', async ({ page, context }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.offline);
  await page.goto(`/dashboard/${E2E.venues.offline}/operations`);
  await expect(page.getByText('Offline Table', { exact: true })).toBeVisible();

  // Allow the production service worker to install, then reload once online so
  // the dashboard shell is controlled before WAN is cut.
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('Offline Table', { exact: true })).toBeVisible();

  await context.setOffline(true);
  const card = page.locator('article').filter({ hasText: 'Offline Table' });
  await card.getByRole('button', { name: 'Start' }).click();
  await expect(card.getByRole('button', { name: 'Finish' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Orders' }).click();
  await expect(page.getByRole('option', { name: 'Cola E2E' })).toBeAttached();
  await card.getByRole('button', { name: 'Add item' }).click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Offline Table', { exact: true })).toBeVisible({ timeout: 15_000 });
  const reloadedCard = page.locator('article').filter({ hasText: 'Offline Table' });
  await expect(reloadedCard.getByRole('button', { name: 'Finish' })).toBeVisible();
  await reloadedCard.getByRole('button', { name: 'Finish' }).click();
  await expect(reloadedCard.getByRole('button', { name: 'Start' })).toBeVisible();

  await context.setOffline(false);

  // The server resource is AVAILABLE before replay starts, so that state alone
  // cannot prove the outbox drained. Wait for the queued ORDER_CREATE itself;
  // then verify the following SESSION_END returned the resource to AVAILABLE.
  await expect.poll(
    async () => {
      try {
        const orders = await api<any[]>(page, 'GET', '/ordering/orders');
        return orders.filter((row) => row.resourceId === 'e2e-resource-offline-1').length;
      } catch {
        return -1;
      }
    },
    { timeout: 30_000, intervals: [500, 1000, 2000] },
  ).toBe(1);

  await expect.poll(
    async () => {
      try {
        const floor = await api<any>(page, 'GET', '/operations/floor');
        return floor.resources.find((row: any) => row.id === 'e2e-resource-offline-1')?.state;
      } catch {
        return 'UNREACHABLE';
      }
    },
    { timeout: 30_000, intervals: [500, 1000, 2000] },
  ).toBe('AVAILABLE');

  const orders = await api<any[]>(page, 'GET', '/ordering/orders');
  const replayed = orders.filter((row) => row.resourceId === 'e2e-resource-offline-1');
  expect(replayed).toHaveLength(1);
});
