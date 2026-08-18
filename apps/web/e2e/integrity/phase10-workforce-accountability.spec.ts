import { expect, test, type Page } from '@playwright/test';
import { api, bindVenue, E2E, loginOwner } from '../helpers/app';

const STAFF = {
  email: 'e2e.staff@gospots.local',
  password: 'GoSpots-E2E-Only-2026!',
};

async function clearAuth(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function loginStaff(page: Page) {
  await page.goto('/login');
  const preferences = page.locator('aside[aria-label="Cookie preferences"]');
  if (await preferences.isVisible().catch(() => false)) {
    await preferences.getByRole('button', { name: /reject optional/i }).click();
  }
  const staffTab = page.getByRole('tab', { name: /staff/i });
  if (await staffTab.count()) await staffTab.click();
  await page.locator('input[type="email"]').first().fill(STAFF.email);
  await page.locator('input[type="password"]').first().fill(STAFF.password);
  await page.locator('form').first().getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

test.describe('Phase 10 workforce accountability @smoke', () => {
  test('PIN lockout, approvals, attribution, alerts and branch access are enforced', async ({ page }) => {
    await loginOwner(page);
    await bindVenue(page, E2E.venues.cash);

    const staff = await api<Array<{ membershipId: string; displayName: string }>>(
      page,
      'GET',
      '/workforce/phase10/staff',
    );
    const employee = staff.find((row) => row.displayName === 'E2E Staff');
    expect(employee).toBeTruthy();

    await api(page, 'PUT', '/workforce/phase10/policy', {
      data: {
        pinLockoutAttempts: 3,
        pinLockoutMinutes: 1,
        operatorSessionMinutes: 5,
      },
    });
    await api(page, 'PUT', '/workforce/phase10/operator-credentials', {
      data: { membershipId: employee!.membershipId, pin: '2468', active: true },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await api(page, 'POST', '/workforce/phase10/operator-switch', {
        data: { membershipId: employee!.membershipId, pin: '1111' },
        expectedStatus: 401,
      });
    }
    await api(page, 'POST', '/workforce/phase10/operator-switch', {
      data: { membershipId: employee!.membershipId, pin: '1111' },
      expectedStatus: 429,
    });

    await api(page, 'PUT', '/workforce/phase10/operator-credentials', {
      data: { membershipId: employee!.membershipId, pin: '2468', active: true },
    });
    const quickSwitch = await api<{
      operatorToken: string;
      operator: { membershipId: string };
    }>(page, 'POST', '/workforce/phase10/operator-switch', {
      data: { membershipId: employee!.membershipId, pin: '2468' },
    });
    expect(quickSwitch.operator.membershipId).toBe(employee!.membershipId);
    expect(quickSwitch.operatorToken.length).toBeGreaterThan(30);

    await api(page, 'PUT', '/workforce/phase10/approval-policies', {
      data: {
        actionKind: 'CASH_PAYOUT',
        enabled: true,
        amountThresholdMinor: null,
        requirePassword: true,
        notifyOnUse: true,
      },
    });
    await api(page, 'PUT', '/workforce/phase10/notification-rules', {
      data: {
        actionKind: 'CASH_PAYOUT',
        enabled: true,
        amountThresholdMinor: null,
        repeatWindowMinutes: 60,
        repeatCountThreshold: 1,
        afterHoursStartHour: null,
        afterHoursEndHour: null,
      },
    });
    await api(page, 'POST', '/cash/sessions', {
      data: { openingFloat: '100.00' },
      idempotencyKey: `phase10-open-${Date.now()}`,
    });

    await clearAuth(page);
    await loginStaff(page);
    await bindVenue(page, E2E.venues.cash);

    await api(page, 'POST', '/auth/venue/e2e-mixed/session', {
      data: {},
      expectedStatus: 403,
    });

    const deniedRequest = await api<{ id: string }>(
      page,
      'POST',
      '/workforce/phase10/approvals',
      {
        data: {
          actionKind: 'CASH_PAYOUT',
          sourceType: 'cash',
          reason: 'E2E denial path',
        },
        idempotencyKey: `phase10-denied-request-${Date.now()}`,
      },
    );

    await clearAuth(page);
    await loginOwner(page);
    await bindVenue(page, E2E.venues.cash);
    const denied = await api<{ status: string }>(
      page,
      'POST',
      `/workforce/phase10/approvals/${deniedRequest.id}/decision`,
      {
        data: { approve: false, note: 'E2E denied' },
        idempotencyKey: `phase10-denied-decision-${Date.now()}`,
      },
    );
    expect(denied.status).toBe('DENIED');

    await clearAuth(page);
    await loginStaff(page);
    await bindVenue(page, E2E.venues.cash);
    await api(page, 'POST', '/cash/movements', {
      data: { type: 'PAID_OUT', amount: '5.00', reasonCategory: 'E2E', note: 'Denied request must not work' },
      idempotencyKey: `phase10-denied-movement-${Date.now()}`,
      headers: { 'x-staff-approval-id': deniedRequest.id },
      expectedStatus: 403,
    });

    const approval = await api<{ id: string }>(
      page,
      'POST',
      '/workforce/phase10/approvals',
      {
        data: {
          actionKind: 'CASH_PAYOUT',
          sourceType: 'cash',
          reason: 'E2E approved cash payout',
        },
        idempotencyKey: `phase10-approved-request-${Date.now()}`,
      },
    );

    await clearAuth(page);
    await loginOwner(page);
    await bindVenue(page, E2E.venues.cash);
    const approved = await api<{ status: string }>(
      page,
      'POST',
      `/workforce/phase10/approvals/${approval.id}/decision`,
      {
        data: { approve: true, note: 'E2E verified' },
        headers: { 'x-confirm-password': E2E.owner.password },
        idempotencyKey: `phase10-approved-decision-${Date.now()}`,
      },
    );
    expect(approved.status).toBe('APPROVED');

    await clearAuth(page);
    await loginStaff(page);
    await bindVenue(page, E2E.venues.cash);
    await api(page, 'POST', '/cash/movements', {
      data: { type: 'PAID_OUT', amount: '5.00', reasonCategory: 'E2E', note: 'Approval required' },
      idempotencyKey: `phase10-missing-approval-${Date.now()}`,
      expectedStatus: 403,
    });
    await api(page, 'POST', '/cash/movements', {
      data: { type: 'PAID_OUT', amount: '5.00', reasonCategory: 'E2E', note: 'Approved payout' },
      idempotencyKey: `phase10-approved-movement-${Date.now()}`,
      headers: { 'x-staff-approval-id': approval.id },
    });
    await api(page, 'POST', '/cash/movements', {
      data: { type: 'PAID_OUT', amount: '1.00', reasonCategory: 'E2E', note: 'Consumed approval reuse' },
      idempotencyKey: `phase10-consumed-reuse-${Date.now()}`,
      headers: { 'x-staff-approval-id': approval.id },
      expectedStatus: 403,
    });

    await clearAuth(page);
    await loginOwner(page);
    await bindVenue(page, E2E.venues.cash);

    const feed = await api<Array<{
      actionKind: string;
      actorName: string;
      approverName: string | null;
      approvalRequestId: string | null;
      suspicious: boolean;
    }>>(page, 'GET', '/workforce/phase10/accountability?take=50');
    const payout = feed.find((row) => row.approvalRequestId === approval.id);
    expect(payout).toMatchObject({
      actionKind: 'CASH_PAYOUT',
      actorName: 'E2E Staff',
      approverName: 'E2E Owner',
      suspicious: true,
    });

    await page.goto(`/dashboard/${E2E.venues.cash}/workforce/accountability`);
    await expect(page.getByRole('heading', { name: 'Workforce accountability' })).toBeVisible();
    await expect(page.getByText('E2E Staff').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Owner controls' })).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('operator PIN');
      await dialog.accept('2468');
    });
    await page.getByRole('button', { name: 'Switch operator' }).click();
    await expect(page.getByText(/Active operator:\s*E2E Staff/)).toBeVisible();

    await page.getByRole('button', { name: 'Accountability' }).click();
    await expect(page.getByRole('cell', { name: 'CASH_PAYOUT' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'E2E Owner' }).first()).toBeVisible();
  });
});