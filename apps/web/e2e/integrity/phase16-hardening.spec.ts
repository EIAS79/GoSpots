import { expect, test } from '@playwright/test';
import {
  E2E,
  api,
  bindVenue,
  createGuestCheckFromUi,
  loginOwner,
} from '../helpers/app';

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

async function timed<T>(fn: () => Promise<T>) {
  const started = performance.now();
  const value = await fn();
  return { value, durationMs: performance.now() - started };
}

test('@smoke P16 mixed authenticated traffic remains responsive and consistent', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.mixed);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await createGuestCheckFromUi(
    page,
    E2E.venues.mixed,
    `P16 Load ${runId}`,
    'Phase 16 Load Guest',
  );

  const station = await api<any>(page, 'POST', '/kitchen/stations', {
    data: { name: `P16 Load KDS ${runId}`, kind: 'KITCHEN', targetSeconds: 300 },
  });

  // Reservation writes exercise capacity/conflict transactions before the mixed read waves.
  const futureBase = Date.now() + 200 * 24 * 60 * 60 * 1000;
  const reservations = await Promise.all(
    Array.from({ length: 4 }, (_, index) => {
      const startsAt = new Date(futureBase + index * 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
      return api<any>(page, 'POST', '/reservations', {
        data: {
          resourceId: 'e2e-resource-mixed-2',
          guestName: `P16 Reservation ${runId}-${index}`,
          partySize: 2,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'CONFIRMED',
        },
      });
    }),
  );
  expect(reservations).toHaveLength(4);

  const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const samples: number[] = [];

  for (let wave = 0; wave < 6; wave += 1) {
    const results = await Promise.all([
      timed(() => api(page, 'GET', '/operations/floor')),
      timed(() => api(page, 'GET', '/guest-checks?status=OPEN')),
      timed(() => api(page, 'GET', '/reservations')),
      timed(() => api(page, 'GET', `/kitchen/board?stationId=${station.id}`)),
      timed(() =>
        api(
          page,
          'GET',
          `/growth/analytics/phase14/workspace?fromDate=${fromDate}&toDate=${toDate}`,
        ),
      ),
    ]);
    samples.push(...results.map((row) => row.durationMs));
  }

  // This is a CI regression budget, not the production SLO. It catches pathological
  // blocking/N+1 regressions while allowing shared-runner variance.
  expect(percentile(samples, 0.95)).toBeLessThan(5_000);
  expect(samples.every((duration) => Number.isFinite(duration) && duration >= 0)).toBeTruthy();
});

test('@smoke P16 operator shell supports keyboard focus and narrow screens', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.mixed);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/${E2E.venues.mixed}`);
  await expect(page.locator('body')).toBeVisible();

  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);

  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
  const focusInfo = await focused.evaluate((element) => ({
    tag: element.tagName,
    ariaLabel: element.getAttribute('aria-label'),
    text: (element.textContent ?? '').trim().slice(0, 120),
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
    boxShadow: getComputedStyle(element).boxShadow,
  }));
  expect(
    Boolean(focusInfo.ariaLabel || focusInfo.text || ['INPUT', 'SELECT', 'TEXTAREA'].includes(focusInfo.tag)),
  ).toBeTruthy();
  expect(
    focusInfo.outlineStyle !== 'none' || focusInfo.outlineWidth !== '0px' || focusInfo.boxShadow !== 'none',
  ).toBeTruthy();

  const undersizedTargets = await page
    .locator('button:visible, a:visible, input:visible, select:visible')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            text: (element.textContent ?? '').trim().slice(0, 80),
          };
        })
        .filter(
          (target) =>
            target.width > 0 &&
            target.height > 0 &&
            (target.width < 32 || target.height < 32),
        )
        .slice(0, 20),
    );
  expect(undersizedTargets, JSON.stringify(undersizedTargets)).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.locator('body')).toBeVisible();
});
