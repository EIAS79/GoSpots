import { expect, test } from '@playwright/test';
import { E2E, api, bindVenue, loginOwner } from '../helpers/app';

test.describe('Phase 14 owner analytics @smoke', () => {
  test('renders canonical owner intelligence and reconciliation for the bound venue', async ({ page }) => {
    await loginOwner(page);
    await bindVenue(page, E2E.venues.mixed);

    const metrics = await api<any>(page, 'GET', '/growth/analytics/phase14/metrics');
    expect(metrics.generatedFromCanonicalFacts).toBe(true);
    expect(metrics.metrics.some((row: any) => row.key === 'net_sales')).toBe(true);
    expect(metrics.metrics.some((row: any) => row.key === 'utilization')).toBe(true);
    expect(metrics.metrics.some((row: any) => row.key === 'stored_value_liability')).toBe(true);

    await page.goto(`/dashboard/${E2E.venues.mixed}/analytics`);
    await expect(page.getByRole('heading', { name: 'Analytics & reconciliation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reconciliation Center' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Attention Center' })).toBeVisible();
    await expect(page.getByText(/business day \+/i)).toBeVisible({ timeout: 15_000 });

    const reconciliation = await api<any>(page, 'GET', '/growth/analytics/phase14/reconciliation?fromDate=2026-08-19&toDate=2026-08-19');
    expect(typeof reconciliation.clear).toBe('boolean');
    expect(Array.isArray(reconciliation.issues)).toBe(true);
  });
});
