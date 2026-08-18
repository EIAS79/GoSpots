import { expect, test } from '@playwright/test';
import { api, bindVenue, E2E, loginOwner } from '../helpers/app';

test.describe('Phase 9 customer value @smoke', () => {
  test('customer portal renders canonical value and controls profile and consent', async ({ page }) => {
    await loginOwner(page);
    await bindVenue(page, E2E.venues.mixed);

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const customer = await api<{ id: string }>(
      page,
      'POST',
      '/growth/phase9/customers/anonymous',
      { data: { name: `Phase 9 Portal ${suffix}` } },
    );

    await api(page, 'POST', `/growth/phase9/customers/${customer.id}/loyalty`, {
      data: {
        type: 'EARN',
        points: 25,
        sourceType: 'E2E',
        sourceId: suffix,
        correlationId: `phase9-e2e-loyalty-${suffix}`,
      },
    });

    const access = await api<{ token: string }>(
      page,
      'POST',
      `/growth/phase9/customers/${customer.id}/portal-token?ttlDays=1`,
      { data: {} },
    );

    await page.goto(`/customer/${encodeURIComponent(access.token)}`);
    await expect(
      page.getByRole('heading', { name: `Phase 9 Portal ${suffix}` }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Loyalty' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Booking history' })).toBeVisible();
    await expect(page.getByText('25', { exact: true })).toBeVisible();
    await expect(page.getByText(/Marketing:.*Not allowed/)).toBeVisible();

    const updatedName = `Phase 9 Updated ${suffix}`;
    const updatedEmail = `phase9.e2e.${suffix}@gospots.invalid`;
    await page.getByLabel('Name').fill(updatedName);
    await page.getByLabel('Email').fill(updatedEmail);
    await page.getByLabel('Phone').fill('+48 500 600 700');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(updatedEmail);
    await expect(page.getByLabel('Phone')).toHaveValue('+48500600700');

    await page.getByRole('button', { name: 'Allow marketing' }).click();
    await expect(page.getByText(/Marketing:.*Allowed/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Withdraw marketing consent' }),
    ).toBeVisible();

    const snapshot = await page.request.get(
      `/api/v1/growth/phase9/portal/${encodeURIComponent(access.token)}`,
      { failOnStatusCode: false },
    );
    expect(snapshot.ok(), await snapshot.text()).toBeTruthy();
    const body = (await snapshot.json()) as {
      customer: {
        name: string | null;
        email: string | null;
        phone: string | null;
        marketingConsent: boolean;
        consentSource: string | null;
      };
      bookingHistory: unknown[];
      loyalty: { balance: number };
    };
    expect(body.customer.name).toBe(updatedName);
    expect(body.customer.email).toBe(updatedEmail);
    expect(body.customer.phone).toBe('+48500600700');
    expect(body.customer.marketingConsent).toBe(true);
    expect(body.customer.consentSource).toBe('CUSTOMER_PORTAL');
    expect(Array.isArray(body.bookingHistory)).toBe(true);
    expect(body.loyalty.balance).toBe(25);
  });
});
