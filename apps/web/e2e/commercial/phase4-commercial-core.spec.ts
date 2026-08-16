import { expect, test } from '@playwright/test';
import {
  E2E,
  api,
  bindVenue,
  closePaidCheck,
  completeLegacyOrder,
  createGuestCheckFromUi,
  loginOwner,
  settleAndSplit,
} from '../helpers/app';

test('@smoke P4 commercial core exposes one controlled tab and settlement flow', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.mixed);
  const check = await createGuestCheckFromUi(
    page,
    E2E.venues.mixed,
    'E2E Phase 4 Commercial',
    'Phase 4 Guest',
  );
  await completeLegacyOrder(page, check.id, 'e2e-item-mixed', 'Phase 4 Order');

  await page.goto(`/dashboard/${E2E.venues.mixed}/checkout`);
  await page.getByText('E2E Phase 4 Commercial', { exact: true }).first().click();
  const controls = page.getByTestId('phase4-commercial-controls');
  await expect(controls).toBeVisible();
  await expect(controls.getByText('Commercial core', { exact: true })).toBeVisible();
  await expect(controls.getByText('Authorized adjustment', { exact: true })).toBeVisible();
  await expect(controls.getByText('Service charge', { exact: true })).toBeVisible();
  await expect(controls.getByText('Gratuity', { exact: true })).toBeVisible();

  await controls.getByRole('combobox').first().selectOption('BAR_TAB');
  await controls.getByPlaceholder('Table / tab reference').fill('Bar tab P4');
  await controls.getByPlaceholder('Service area', { exact: true }).fill('Main bar');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/v1/commercial/checks/${check.id}/profile`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
    ),
    controls.getByRole('button', { name: 'Save context' }).click(),
  ]);

  let context = await api<any>(page, 'GET', `/commercial/checks/${check.id}`);
  expect(context.profile.checkType).toBe('BAR_TAB');
  expect(context.profile.tableReference).toBe('Bar tab P4');
  expect(context.profile.serviceArea).toBe('Main bar');

  const adjustment = controls.locator('form').filter({ hasText: 'Authorized adjustment' });
  await adjustment.getByRole('combobox').selectOption('FIXED_DISCOUNT');
  await adjustment.locator('input[type="number"]').fill('1.00');
  await adjustment.getByPlaceholder('Required reason').fill('Phase 4 browser acceptance');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/v1/commercial/checks/${check.id}/adjustments`) &&
      response.request().method() === 'POST' &&
      response.status() === 201,
    ),
    adjustment.getByRole('button', { name: 'Apply adjustment' }).click(),
  ]);

  context = await api<any>(page, 'GET', `/commercial/checks/${check.id}`);
  expect(context.adjustments.filter((row: any) => row.voidedAt == null)).toHaveLength(1);
  expect(context.adjustments[0].type).toBe('FIXED_DISCOUNT');
  expect(context.adjustments[0].amountMinor).toBe(100);
  expect(context.adjustments[0].beforeTotalMinor).toBeGreaterThan(context.adjustments[0].afterTotalMinor);

  const versionAfterDiscount = context.check.version as number;
  await api(page, 'POST', `/commercial/checks/${check.id}/service-charges`, {
    data: {
      expectedCheckVersion: versionAfterDiscount,
      mode: 'FIXED',
      amountMinor: 50,
      reason: 'Phase 4 service charge',
    },
    idempotencyKey: `${check.id}-p4-service-charge`,
  });
  context = await api<any>(page, 'GET', `/commercial/checks/${check.id}`);
  expect(context.serviceCharges.filter((row: any) => row.voidedAt == null)).toHaveLength(1);

  await api(page, 'POST', `/commercial/checks/${check.id}/tips`, {
    data: {
      expectedCheckVersion: context.check.version,
      method: 'OTHER',
      amountMinor: 75,
      note: 'Phase 4 gratuity',
    },
    idempotencyKey: `${check.id}-p4-tip`,
  });
  context = await api<any>(page, 'GET', `/commercial/checks/${check.id}`);
  expect(context.tips.filter((row: any) => row.voidedAt == null)).toHaveLength(1);

  await api(page, 'POST', `/commercial/checks/${check.id}/transfer`, {
    data: {
      expectedCheckVersion: context.check.version,
      serviceArea: 'Terrace bar',
      reason: 'Guest moved to terrace',
    },
    idempotencyKey: `${check.id}-p4-transfer`,
  });
  context = await api<any>(page, 'GET', `/commercial/checks/${check.id}`);
  expect(context.profile.serviceArea).toBe('Terrace bar');
  expect(context.transfers).toHaveLength(1);

  await api(page, 'POST', `/commercial/checks/${check.id}/adjustments`, {
    data: {
      expectedCheckVersion: versionAfterDiscount,
      type: 'FIXED_DISCOUNT',
      scope: 'CHECK',
      amountMinor: 1,
      reason: 'Stale write must fail',
    },
    idempotencyKey: `${check.id}-p4-stale-adjustment`,
    expectedStatus: 409,
  });

  const guard = await api<any>(page, 'GET', '/commercial/day-close/open-tab-guard');
  expect(guard.openTabCount).toBeGreaterThan(0);
  expect(guard.openChecks.some((row: any) => row.id === check.id)).toBeTruthy();
  expect(guard.policyAllowsOpenTabs).toBe(false);
  expect(guard.allowed).toBe(true);
  expect(guard.managerOverrideAvailable).toBe(true);

  const { settlement, state } = await settleAndSplit(page, check.id, ['MANUAL_CARD', 'OTHER']);
  const paid = state.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
  expect(paid).toBeCloseTo(Number(settlement.total), 4);
  await closePaidCheck(page, check.id);

  await page.goto(`/dashboard/${E2E.venues.mixed}/checkout`);
  await expect(page.getByText('E2E Phase 4 Commercial', { exact: true })).toHaveCount(0);
});