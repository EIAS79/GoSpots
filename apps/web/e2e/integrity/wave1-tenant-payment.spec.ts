import { expect, test } from '@playwright/test';
import {
  E2E, api, bindVenue, completeLegacyOrder, createGuestCheckFromUi, loginOwner,
} from '../helpers/app';

/** PostgreSQL-backed HTTP shop identity negative paths; deliberately no provider side effects. */
test('@smoke W1 tenant B cannot read, tender, settle or mutate venue A financial records', async ({ page }) => {
  test.setTimeout(120_000);
  await loginOwner(page);
  await bindVenue(page, E2E.venues.orgA);
  const check = await createGuestCheckFromUi(page, E2E.venues.orgA, `W1 Tenant Firewall ${Date.now()}`);
  await completeLegacyOrder(page, check.id, 'e2e-item-org-a', `W1 Org A Order ${Date.now()}`);
  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, { data: {} });
  const settlement = await api<any>(page, 'POST', `/checkout/checks/${check.id}/settlements`, {
    data: { expectedVersion: preview.checkVersion }, idempotencyKey: `w1-org-a-${check.id}`,
  });
  const original = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  expect(original.payments).toEqual([]);

  await bindVenue(page, E2E.venues.orgB);
  for (const [method, path] of [
    ['GET', `/guest-checks/${check.id}`],
    ['GET', `/checkout/settlements/${settlement.id}/payment-state`],
    ['GET', `/checkout/settlements/${settlement.id}/provider-payments`],
  ] as const) {
    const denial = await api<any>(page, method, path, { expectedStatus: 404 });
    expect(denial).toBeTruthy();
  }
  await api(page, 'POST', `/checkout/checks/${check.id}/preview`, {
    data: {}, expectedStatus: 404,
  });
  await api(page, 'POST', `/checkout/settlements/${settlement.id}/payments`, {
    data: {
      expectedCheckVersion: original.guestCheckVersion,
      method: 'OTHER', allocationKind: 'REMAINING',
      allocations: settlement.snapshots.map((line: any) => ({
        snapshotId: line.id, amount: line.finalAmount,
      })),
    },
    idempotencyKey: `w1-b-forged-${check.id}`, expectedStatus: 404,
  });
  await api(page, 'POST', `/checkout/settlements/${settlement.id}/provider-payments`, {
    data: {
      expectedCheckVersion: original.guestCheckVersion, provider: 'fake',
      terminalId: 'foreign-terminal', allocationKind: 'REMAINING',
      allocations: settlement.snapshots.map((line: any) => ({
        snapshotId: line.id, amount: line.finalAmount,
      })),
    },
    idempotencyKey: `w1-b-foreign-provider-${check.id}`, expectedStatus: 404,
  });

  await bindVenue(page, E2E.venues.orgA);
  const after = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  expect(after).toMatchObject({
    state: original.state, amountDue: original.amountDue,
    guestCheckVersion: original.guestCheckVersion,
  });
  expect(after.payments).toEqual([]);
});
