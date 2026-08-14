import { expect, test } from '@playwright/test';
import { api } from '../helpers/app';

test('@smoke P2 empty venue reaches operational floor without database edits', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `p2-empty-${suffix}`.slice(0, 60);
  const password = 'GoSpots-P2-E2E-Only-2026!';

  await page.goto('/register');
  await page.request.get('/api/v1/auth/csrf');
  const registered = await api<{ venuePath: string }>(page, 'POST', '/auth/register', {
    data: {
      email: `p2-${suffix}@gospots.local`,
      password,
      name: 'Phase 2 Owner',
      businessLegalName: `Phase 2 Venue ${suffix}`,
      businessCountryCode: 'PL',
      businessId: `P2${suffix.replace(/[^a-z0-9]/gi, '').slice(-24)}`,
      shopName: 'Phase 2 Empty Venue',
      shopSlug: slug,
      packId: 'mixed',
      venueType: 'mixed',
      city: 'Warsaw',
      country: 'PL',
    },
  });
  expect(registered.venuePath).toBeTruthy();

  const settings = await api<any>(page, 'GET', '/shop/settings');
  await api(page, 'PATCH', '/shop/settings', {
    data: {
      expectedVersion: settings.shop.version,
      legalName: `Phase 2 Venue ${suffix}`,
      venueType: 'mixed',
      address: 'Testowa 2',
      city: 'Warsaw',
      country: 'PL',
      timezone: 'Europe/Warsaw',
      businessDayStartMinutes: 240,
      locale: 'en',
    },
  });

  const template = await api<{ categoryIds: string[] }>(
    page,
    'POST',
    '/shop/onboarding/apply-template',
    {
      data: { templateId: 'mixed_activity' },
      idempotencyKey: `p2-template-${suffix}`,
    },
  );
  expect(template.categoryIds.length).toBeGreaterThan(0);

  const catalog = await api<any>(page, 'GET', '/resources/catalog');
  const resource = catalog.categories.flatMap((category: any) => category.resources)[0];
  expect(resource).toBeTruthy();
  const session = await api<any>(page, 'POST', '/operations/sessions/start', {
    data: { resourceId: resource.id },
  });
  await api(page, 'POST', `/operations/sessions/${session.id}/finish`, {
    data: { expectedVersion: session.version },
  });

  const readiness = await api<any>(page, 'GET', '/shop/onboarding/readiness');
  expect(readiness.phase).toBe(2);
  expect(readiness.operational).toBeTruthy();
  expect(readiness.steps).toHaveLength(12);
  expect(readiness.counts.zones).toBeGreaterThan(0);
  expect(readiness.counts.resources).toBeGreaterThan(0);
  expect(readiness.counts.rates).toBeGreaterThan(0);
  expect(readiness.counts.testSessions).toBeGreaterThan(0);

  await page.goto(`/dashboard/${registered.venuePath}/onboarding`);
  await page.evaluate(({ venueSlug }) => {
    window.localStorage.setItem(
      `locora.onboarding.v1.${venueSlug}`,
      JSON.stringify({
        version: 1,
        venuePath: venueSlug,
        shopId: null,
        currentStep: 11,
        completedSteps: Array.from({ length: 11 }, (_, index) => index),
        skippedSteps: [],
        templateId: 'mixed_activity',
        templateCategoryIds: [],
        completedAt: null,
        dismissedBanner: false,
        startedAt: new Date().toISOString(),
      }),
    );
  }, { venueSlug: slug });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Readiness' })).toBeVisible();
  await expect(page.getByText('Operational floor is ready')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish setup' })).toBeEnabled();
});
