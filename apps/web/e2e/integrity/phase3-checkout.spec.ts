import { expect, test } from '@playwright/test';
import { E2E, api, bindVenue, completeLegacyOrder, createGuestCheckFromUi, loginOwner } from '../helpers/app';

test('@smoke Phase 3 refuses settlement while an attached order is still mutable', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.cash);
  const check = await createGuestCheckFromUi(page, E2E.venues.cash, `Phase3 Open Bill ${Date.now()}`);
  const order = await api<any>(page, 'POST', '/finance/orders', {
    data: { label: `Phase3 Mutable ${Date.now()}`, guestCount: 1 },
    idempotencyKey: `${check.id}-phase3-mutable-order`,
  });
  await api(page, 'POST', `/finance/orders/${order.id}/lines`, {
    data: { menuItemId: 'e2e-item-cash', quantity: 1 },
    idempotencyKey: `${check.id}-phase3-mutable-line`,
  });
  await api(page, 'POST', `/guest-checks/${check.id}/attach`, { data: { shopOrderId: order.id } });

  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, { data: {} });
  const rejected = await api<any>(page, 'POST', `/checkout/checks/${check.id}/settlements`, {
    data: { expectedVersion: preview.checkVersion },
    idempotencyKey: `${check.id}-phase3-mutable-settlement`,
    expectedStatus: 409,
  });
  expect(rejected.code).toBe('STATE_CONFLICT');
  expect(rejected.details?.stage).toBe('FINALIZE_BILL');
  expect(rejected.details?.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: order.id, type: 'SHOP_ORDER', status: 'PENDING' }),
  ]));
});

test('@smoke Phase 3 does not accept a second payment after a settlement is fully paid', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.cash);
  const check = await createGuestCheckFromUi(page, E2E.venues.cash, `Phase3 Duplicate Pay ${Date.now()}`);
  await completeLegacyOrder(page, check.id, 'e2e-item-cash', `Phase3 Paid Order ${Date.now()}`);

  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, { data: {} });
  const settlement = await api<any>(page, 'POST', `/checkout/checks/${check.id}/settlements`, {
    data: { expectedVersion: preview.checkVersion },
    idempotencyKey: `${check.id}-phase3-paid-settlement`,
  });
  let state = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  const allocations = settlement.snapshots.map((snapshot: any) => ({
    snapshotId: snapshot.id,
    amount: snapshot.finalAmount,
  }));
  state = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/payments`, {
    data: {
      expectedCheckVersion: state.guestCheckVersion,
      method: 'MANUAL_CARD',
      allocationKind: 'REMAINING',
      allocations,
    },
    idempotencyKey: `${check.id}-phase3-payment-1`,
  });
  expect(state.state).toBe('PAID');
  expect(Number(state.amountDue)).toBe(0);
  expect(state.payments).toHaveLength(1);

  await api(page, 'POST', `/checkout/settlements/${settlement.id}/payments`, {
    data: {
      expectedCheckVersion: state.guestCheckVersion,
      method: 'MANUAL_CARD',
      allocationKind: 'REMAINING',
      allocations,
    },
    idempotencyKey: `${check.id}-phase3-payment-2`,
    expectedStatus: 409,
  });
  const after = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  expect(after.state).toBe('PAID');
  expect(after.payments).toHaveLength(1);
});