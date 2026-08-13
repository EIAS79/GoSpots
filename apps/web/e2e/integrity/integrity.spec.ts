import { expect, test } from '@playwright/test';
import {
  E2E,
  api,
  bindVenue,
  completeLegacyOrder,
  createGuestCheckFromUi,
  loginOwner,
  settleAndSplit,
  closePaidCheck,
} from '../helpers/app';

test('E2E-05 stale browser version is rejected without silent overwrite', async ({ page, context }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.conflict);
  const check = await createGuestCheckFromUi(page, E2E.venues.conflict, 'E2E Conflict Check');
  const staleVersion = check.version as number;

  const second = await context.newPage();
  await second.goto(`/dashboard/${E2E.venues.conflict}/checkout`);
  await expect(second.getByText('E2E Conflict Check', { exact: true }).first()).toBeVisible();

  await api(page, 'PATCH', `/guest-checks/${check.id}`, {
    data: { note: 'Changed by browser A' },
  });
  const conflict = await api<any>(second, 'POST', `/checkout/checks/${check.id}/preview`, {
    data: { expectedVersion: staleVersion },
    expectedStatus: 409,
  });
  expect(conflict.code).toBe('VERSION_CONFLICT');

  const latest = await api<any>(page, 'GET', `/guest-checks/${check.id}`);
  expect(latest.note).toBe('Changed by browser A');
  await second.close();
});

test('E2E-06 payment UNKNOWN reconciles the same provider transaction', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.payment);

  const devices = await api<{ devices: Array<any> }>(page, 'GET', '/devices');
  let terminal = devices.devices.find(
    (device) => device.type === 'PAYMENT_TERMINAL' && device.provider === 'fake',
  )?.terminal;
  if (!terminal) {
    const created = await api<any>(page, 'POST', '/devices', {
      data: {
        label: 'E2E Fake Terminal',
        type: 'PAYMENT_TERMINAL',
        provider: 'fake',
        externalTerminalId: 'e2e-fake-terminal',
      },
    });
    terminal = created.terminal;
  }
  expect(terminal?.id).toBeTruthy();

  const key = 'e2e-payment-timeout-captured';
  const request = {
    provider: 'fake',
    terminalId: terminal.id,
    amount: '12.3400',
    currency: 'PLN',
    metadata: { scenario: 'timeout_captured' },
  };
  const first = await api<any>(page, 'POST', '/payments/operations', {
    data: request,
    idempotencyKey: key,
  });
  expect(first.state).toBe('UNKNOWN');
  expect(first.reconciliationRequired).toBeTruthy();

  const replay = await api<any>(page, 'POST', '/payments/operations', {
    data: request,
    idempotencyKey: key,
  });
  expect(replay.id).toBe(first.id);
  expect(replay.providerPaymentId).toBe(first.providerPaymentId);

  const changed = await api<any>(page, 'POST', '/payments/operations', {
    data: { ...request, amount: '13.3400' },
    idempotencyKey: key,
    expectedStatus: 409,
  });
  expect(String(changed.message)).toMatch(/Idempotency-Key/i);

  const reconciled = await api<any>(page, 'POST', `/payments/operations/${first.id}/reconcile`, {
    data: {},
  });
  expect(reconciled.state).toBe('CAPTURED');
  expect(reconciled.reconciliationRequired).toBeFalsy();
  expect(reconciled.providerPaymentId).toBe(first.providerPaymentId);
});

test('E2E-07 cash shift reconciles sales movements count variance and approval', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.cash);

  const shift = await api<any>(page, 'POST', '/cash/sessions', {
    data: { openingFloat: '100.00' },
    idempotencyKey: 'e2e-cash-open',
  });
  expect(shift.status).toBe('OPEN');

  const check = await createGuestCheckFromUi(page, E2E.venues.cash, 'E2E Cash Check');
  await completeLegacyOrder(page, check.id, 'e2e-item-cash', 'E2E Cash Order');
  const { state } = await settleAndSplit(page, check.id, ['CASH', 'MANUAL_CARD']);
  await closePaidCheck(page, check.id);
  const cashPayment = state.payments.find((payment: any) => payment.method === 'CASH');
  expect(cashPayment).toBeTruthy();

  await api(page, 'POST', `/cash/sessions/${shift.id}/movements`, {
    data: { type: 'PAY_IN', amount: '10.00', reasonCategory: 'E2E_PAY_IN' },
    idempotencyKey: 'e2e-cash-pay-in',
  });
  await api(page, 'POST', `/cash/sessions/${shift.id}/movements`, {
    data: { type: 'PAY_OUT', amount: '5.00', reasonCategory: 'E2E_PAY_OUT' },
    idempotencyKey: 'e2e-cash-pay-out',
  });
  await api(page, 'POST', `/cash/sessions/${shift.id}/movements`, {
    data: { type: 'CASH_REFUND', amount: '2.00', reasonCategory: 'E2E_REFUND' },
    idempotencyKey: 'e2e-cash-refund',
  });

  const exactExpected = 100 + Number(cashPayment.amount) + 10 - 5 - 2;
  const beforeCount = await api<any>(page, 'GET', '/cash/my-shift');
  expect(beforeCount.session?.id).toBe(shift.id);
  expect(beforeCount.session?.expectedHidden).toBeFalsy();
  expect(Number(beforeCount.session?.expectedCash)).toBeCloseTo(exactExpected, 4);

  const countedAmount = (exactExpected + 2).toFixed(2);
  const counted = await api<any>(page, 'POST', `/cash/sessions/${shift.id}/counts`, {
    data: { countedAmount },
    idempotencyKey: 'e2e-cash-count',
  });
  expect(Number(counted.variance)).toBeCloseTo(2, 4);
  expect(counted.requiresApproval).toBeTruthy();
  expect(counted.cashCountId).toBeTruthy();

  await api(page, 'POST', `/cash/sessions/${shift.id}/approve-variance`, {
    data: { cashCountId: counted.cashCountId, note: 'E2E variance approval' },
    idempotencyKey: 'e2e-cash-approve',
  });
  const closed = await api<any>(page, 'POST', `/cash/sessions/${shift.id}/close`, {
    data: { cashCountId: counted.cashCountId, note: 'E2E close' },
    idempotencyKey: 'e2e-cash-close',
  });
  expect(closed.status).toBe('CLOSED');
  expect(Number(closed.variance)).toBeCloseTo(2, 4);
});

test('E2E-08 organization access does not grant non-member venue access', async ({ page }) => {
  await loginOwner(page, E2E.analyst);
  await bindVenue(page, E2E.venues.orgA);

  const listed = await api<any>(page, 'GET', '/organizations');
  const organization = listed.organizations.find((row: any) => row.id === 'e2e-organization');
  expect(organization).toBeTruthy();
  const shopA = organization.shops.find((row: any) => row.id === 'e2e-shop-org-a');
  const shopB = organization.shops.find((row: any) => row.id === 'e2e-shop-org-b');
  expect(shopA.operationalAccess).toBeTruthy();
  expect(shopB.operationalAccess).toBeFalsy();

  await api(page, 'GET', `/auth/venue/${E2E.venues.orgB}`, { expectedStatus: 401 });

  const analytics = await api<any>(page, 'GET', '/organizations/e2e-organization/analytics');
  expect(analytics.shops.every((row: any) => row.id === 'e2e-shop-org-a')).toBeTruthy();
});
