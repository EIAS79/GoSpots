import { expect, test } from '@playwright/test';
import {
  E2E, api, bindVenue, completeLegacyOrder, createGuestCheckFromUi, loginOwner,
} from '../helpers/app';

/**
 * Real HTTP -> Nest -> ephemeral PostgreSQL checkout regression.
 * 'fake' is the nonproduction deterministic payment connector: this cannot
 * certify a physical Adyen terminal or a signed production Adyen webhook.
 */
test('@smoke W1 captured provider checkout split/replay/refund keeps financial lineage intact', async ({ page }) => {
  test.setTimeout(180_000);
  await loginOwner(page);
  await bindVenue(page, E2E.venues.payment);
  const devices = await api<{ devices: any[] }>(page, 'GET', '/devices');
  let terminal = devices.devices.find(
    (device) => device.type === 'PAYMENT_TERMINAL' && device.provider === 'fake',
  )?.terminal;
  if (!terminal) {
    const created = await api<any>(page, 'POST', '/devices', {
      data: {
        label: 'W1 Fake Checkout Terminal', type: 'PAYMENT_TERMINAL',
        provider: 'fake', externalTerminalId: 'w1-fake-checkout-terminal',
      },
    });
    terminal = created.terminal;
  }
  expect(terminal?.id).toBeTruthy();

  const check = await createGuestCheckFromUi(
    page, E2E.venues.payment, `W1 Checkout Provider ${Date.now()}`,
  );
  await completeLegacyOrder(page, check.id, 'e2e-item-payment', `W1 Provider Order ${Date.now()}`);
  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, { data: {} });
  const settlement = await api<any>(page, 'POST', `/checkout/checks/${check.id}/settlements`, {
    data: { expectedVersion: preview.checkVersion },
    idempotencyKey: `${check.id}-w1-checkout-settlement`,
  });
  const before = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  const groups = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/payment-groups/preview`, {
    data: { mode: 'EQUAL', parts: 2 },
  });
  expect(groups.groups).toHaveLength(2);
  const firstAllocations = groups.groups[0].allocations.map((line: any) => ({
    snapshotId: line.snapshotId, amount: line.amount,
  }));
  const providerPayload = {
    provider: 'fake', terminalId: terminal.id, allocationKind: 'EQUAL',
    allocations: firstAllocations,
    expectedCheckVersion: before.guestCheckVersion,
  };
  const key = `w1-checkout-capture-${check.id}`;
  const captured = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/provider-payments`, {
    data: providerPayload, idempotencyKey: key,
  });
  expect(captured.operation.state).toBe('CAPTURED');
  expect(captured.operation.checkoutPaymentId).toBeTruthy();
  expect(captured.checkoutFinalizationRequired).toBe(false);
  const partPaid = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  expect(partPaid.payments).toHaveLength(1);
  expect(partPaid.payments[0].method).toBe('MANUAL_CARD');
  expect(partPaid.payments[0].status).toBe('SUCCESS');
  expect(Number(partPaid.amountDue)).toBeGreaterThan(0);

  const replay = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/provider-payments`, {
    data: providerPayload, idempotencyKey: key,
  });
  expect(replay.operation.id).toBe(captured.operation.id);
  expect(replay.operation.checkoutPaymentId).toBe(captured.operation.checkoutPaymentId);
  const afterReplay = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  expect(afterReplay.payments).toEqual(partPaid.payments);
  expect(afterReplay.amountDue).toBe(partPaid.amountDue);

  const wrongReplay = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/provider-payments`, {
    data: { ...providerPayload, allocations: firstAllocations.map((line: any) => ({ ...line, amount: '0.0100' })) },
    idempotencyKey: key, expectedStatus: 409,
  });
  expect(String(wrongReplay.message)).toMatch(/idempotency/i);
  const unchanged = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  expect(unchanged.payments).toEqual(partPaid.payments);

  const completed = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/payments`, {
    data: {
      expectedCheckVersion: unchanged.guestCheckVersion,
      method: 'CASH', allocationKind: 'EQUAL',
      allocations: groups.groups[1].allocations.map((line: any) => ({
        snapshotId: line.snapshotId, amount: line.amount,
      })),
    },
    idempotencyKey: `w1-cash-remainder-${check.id}`,
  });
  expect(completed.state).toBe('PAID');
  expect(Number(completed.amountDue)).toBe(0);
  expect(completed.payments).toHaveLength(2);

  const refund = await api<any>(page, 'POST', `/checkout/provider-payments/${captured.operation.id}/refund-remaining`, {
    data: { reason: 'W1 test reversal' },
    idempotencyKey: `w1-provider-refund-${check.id}`,
  });
  expect(refund.state).toBe('SUCCEEDED');
  const lines = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/provider-payments`);
  const operation = lines.find((line: any) => line.id === captured.operation.id);
  expect(operation.checkoutPaymentId).toBe(captured.operation.checkoutPaymentId);
  expect(operation.refunds).toHaveLength(1);
  expect(Number(operation.refundedAmount)).toBeCloseTo(Number(refund.amount), 2);

  // Same-key retry must return the identical durable refund without charging again.
  const replayRefund = await api<any>(page, 'POST', `/checkout/provider-payments/${captured.operation.id}/refund-remaining`, {
    data: { reason: 'W1 test reversal' },
    idempotencyKey: `w1-provider-refund-${check.id}`,
  });
  expect(replayRefund.id).toBe(refund.id);
  expect(replayRefund.providerRefundId).toBe(refund.providerRefundId);
  await bindVenue(page, E2E.venues.orgB);
  await api(page, 'POST', `/checkout/provider-payments/${captured.operation.id}/refund-remaining`, {
    data: { reason: 'Foreign shop must be denied' },
    idempotencyKey: `foreign-${check.id}`, expectedStatus: 404,
  });
  await bindVenue(page, E2E.venues.payment);
  const afterward = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/provider-payments`);
  expect(afterward.find((line: any) => line.id === captured.operation.id)?.refunds).toHaveLength(1);
});
