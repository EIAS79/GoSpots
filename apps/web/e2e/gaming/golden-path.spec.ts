import { expect, test } from '@playwright/test';
import {
  E2E,
  api,
  bindVenue,
  completeLegacyOrder,
  createGuestCheckFromUi,
  endedPlaySession,
  loginOwner,
  settleAndSplit,
} from '../helpers/app';

test('@smoke E2E-01 gaming cashier golden path', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.gaming);

  const check = await createGuestCheckFromUi(page, E2E.venues.gaming, 'E2E Gaming Golden');

  const operationsSession = await api<any>(page, 'POST', '/operations/sessions/start', {
    data: {
      resourceId: 'e2e-resource-gaming-1',
      guestCheckId: check.id,
    },
  });
  const originalRateSnapshot = operationsSession.rateSnapshot;
  await api(page, 'POST', `/operations/sessions/${operationsSession.id}/pause`, {
    data: { reason: 'E2E pause' },
  });
  await api(page, 'POST', `/operations/sessions/${operationsSession.id}/resume`, { data: {} });
  const moved = await api<any>(page, 'POST', `/operations/sessions/${operationsSession.id}/move`, {
    data: { resourceId: 'e2e-resource-gaming-2' },
  });
  expect(moved.rateSnapshot).toEqual(originalRateSnapshot);
  const finished = await api<any>(page, 'POST', `/operations/sessions/${operationsSession.id}/finish`, {
    data: {},
  });
  expect(finished.status).toBe('FINISHED');
  expect(finished.accruedMinor).toBeGreaterThanOrEqual(0);

  await endedPlaySession(
    page,
    check.id,
    'e2e-resource-gaming-1',
    'E2E Gaming Play',
    30,
  );
  await completeLegacyOrder(
    page,
    check.id,
    'e2e-item-gaming',
    'E2E Gaming Drinks',
  );

  const { settlement, state } = await settleAndSplit(page, check.id, ['CASH', 'MANUAL_CARD']);
  expect(state.payments).toHaveLength(2);

  await page.goto(`/dashboard/${E2E.venues.gaming}/checkout`);
  await expect(page.getByText('E2E Gaming Golden', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/recorded payments/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /close paid check/i })).toBeEnabled();
  await page.getByRole('button', { name: /close paid check/i }).click();
  await expect(page.getByText(/ready to close/i)).toHaveCount(0, { timeout: 15_000 });

  await api(page, 'PUT', '/compliance/tax-categories', {
    data: { code: 'VAT23', label: 'VAT 23%', ratePercent: '23', active: true },
  });
  await api(page, 'PUT', '/compliance/profile', {
    data: {
      legalName: 'GoSpots E2E Sp. z o.o.',
      taxId: '5250001009',
      streetAddress: 'Testowa 1',
      postalCode: '00-001',
      city: 'Warsaw',
      defaultTaxCategoryCode: 'VAT23',
      ksefEnvironment: 'TEST',
    },
  });
  const device = await api<any>(page, 'PUT', '/compliance/fiscal-devices', {
    data: { label: 'E2E simulated fiscal', provider: 'SIMULATED', enabled: true },
  });
  const document = await api<any>(page, 'POST', `/compliance/settlements/${settlement.id}/documents`, {
    data: { kind: 'RECEIPT' },
  });
  const fiscal = await api<any>(page, 'POST', `/compliance/documents/${document.id}/fiscalize`, {
    data: { fiscalDeviceId: device.id },
    idempotencyKey: `${document.id}-fiscalize`,
  });
  expect(['ACCEPTED', 'COMPLETED']).toContain(fiscal.state ?? fiscal.status);

  const settled = await api<{ checks: Array<any> }>(page, 'GET', '/guest-checks?status=SETTLED');
  expect(settled.checks.some((row) => row.id === check.id)).toBeTruthy();
});
