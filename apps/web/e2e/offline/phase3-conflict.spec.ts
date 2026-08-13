import { expect, test } from '@playwright/test';
import { E2E, api, bindVenue, loginOwner } from '../helpers/app';

async function countConflicts(page: import('@playwright/test').Page) {
  return page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('gospots-offline-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        resolve((read.result as Array<{ state?: string }>).filter((row) => row.state === 'CONFLICT').length);
        db.close();
      };
    };
  }));
}

test('@smoke Phase 3 Offline Lite shows a cloud conflict for review', async ({ page, context, browser }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.offline);
  await page.goto(`/dashboard/${E2E.venues.offline}/operations`);
  await expect(page.getByText('Offline Table', { exact: true })).toBeVisible();
  await page.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
  await page.reload();

  await context.setOffline(true);
  const card = page.locator('article').filter({ hasText: 'Offline Table' });
  await card.getByRole('button', { name: 'Start' }).click();
  await expect(card.getByRole('button', { name: 'Finish' })).toBeVisible({ timeout: 15_000 });

  const secondContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000' });
  const second = await secondContext.newPage();
  let cloudSessionId: string | null = null;
  try {
    await loginOwner(second);
    await bindVenue(second, E2E.venues.offline);
    const cloudSession = await api<any>(second, 'POST', '/operations/sessions/start', {
      data: { resourceId: 'e2e-resource-offline-1' },
    });
    cloudSessionId = cloudSession.id;

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => countConflicts(page), { timeout: 30_000, intervals: [250, 500, 1000, 2000] }).toBe(1);

    await page.goto(`/dashboard/${E2E.venues.offline}/offline-sync`);
    await expect(page.getByText('CONFLICT', { exact: true })).toBeVisible();
    await expect(page.getByText(/RESOURCE_CONFLICT/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry same operation' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard local operation' }).click();
    await expect(page.getByText('No offline work needs review.')).toBeVisible();
  } finally {
    if (cloudSessionId) await api(second, 'POST', `/operations/sessions/${cloudSessionId}/finish`, { data: {} });
    await secondContext.close();
    await context.setOffline(false);
  }
});
