import { expect, test } from '@playwright/test';
import {
  E2E,
  api,
  bindVenue,
  createGuestCheckFromUi,
  loginOwner,
  settleAndSplit,
  closePaidCheck,
} from '../helpers/app';

test('@smoke E2E-02 restaurant order to KDS to checkout', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.restaurant);
  const check = await createGuestCheckFromUi(
    page,
    E2E.venues.restaurant,
    'E2E Restaurant Golden',
    'Restaurant Guest',
  );

  const station = await api<any>(page, 'POST', '/kitchen/stations', {
    data: { name: 'Kitchen E2E', kind: 'KITCHEN', targetSeconds: 300 },
  });
  await api(page, 'POST', '/kitchen/routes', {
    data: {
      key: 'e2e-kitchen-route',
      stationId: station.id,
      menuItemId: 'e2e-item-restaurant',
    },
  });
  await api(page, 'PUT', '/ordering/commerce-profile', {
    data: {
      menuItemId: 'e2e-item-restaurant',
      taxCategoryKey: 'VAT23',
      taxRateBps: 2300,
      prepRouteKey: 'e2e-kitchen-route',
      favorite: true,
    },
  });

  const group = await api<any>(page, 'POST', '/ordering/modifier-groups', {
    data: { name: 'Sauce E2E', required: false, minSelect: 0, maxSelect: 2 },
  });
  const modifier = await api<any>(page, 'POST', '/ordering/modifiers', {
    data: { groupId: group.id, name: 'Extra sauce', priceDeltaMinor: 200 },
  });
  const variant = await api<any>(page, 'POST', '/ordering/variants', {
    data: { menuItemId: 'e2e-item-restaurant', name: 'Large', priceDeltaMinor: 500 },
  });
  await api(page, 'POST', '/ordering/item-modifier-groups', {
    data: { menuItemId: 'e2e-item-restaurant', modifierGroupId: group.id },
  });

  const venueOrder = await api<any>(page, 'POST', '/ordering/orders', {
    data: {
      serviceMode: 'DINING',
      guestCheckId: check.id,
      resourceId: 'e2e-resource-restaurant-1',
      seat: 1,
      guestLabel: 'Seat 1',
      lines: [
        {
          menuItemId: 'e2e-item-restaurant',
          variantId: variant.id,
          modifierIds: [modifier.id],
          quantity: 1,
          seat: 1,
        },
      ],
    },
  });
  expect(venueOrder.totalMinor).toBeGreaterThan(0);

  const routed = await api<any>(page, 'POST', `/kitchen/orders/${venueOrder.id}/submit`, {
    data: {},
  });
  expect(routed.ticketCount).toBe(1);
  let board = await api<any>(page, 'GET', `/kitchen/board?stationId=${station.id}`);
  const ticket = board.tickets.find((row: any) => row.orderId === venueOrder.id);
  expect(ticket).toBeTruthy();
  await api(page, 'POST', `/kitchen/tickets/${ticket.id}/status`, {
    data: { status: 'PREPARING' },
  });
  await api(page, 'POST', `/kitchen/tickets/${ticket.id}/status`, {
    data: { status: 'READY' },
  });
  await api(page, 'POST', `/kitchen/tickets/${ticket.id}/status`, {
    data: { status: 'COLLECTED' },
  });
  board = await api<any>(page, 'GET', `/kitchen/board?stationId=${station.id}`);
  expect(board.tickets.some((row: any) => row.id === ticket.id)).toBeFalsy();

  const orderBeforeCompletion = await api<any>(page, 'GET', `/ordering/orders/${venueOrder.id}`);
  const completedOrder = await api<any>(page, 'POST', `/commercial/orders/${venueOrder.id}/complete`, {
    data: { expectedVersion: orderBeforeCompletion.version },
    idempotencyKey: `${check.id}-venue-order-complete`,
  });
  expect(completedOrder.status).toBe('COMPLETED');

  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, {
    data: {},
  });
  expect(preview.billReady).toBeTruthy();
  expect(preview.blockers).toHaveLength(0);
  expect(Number(preview.commercial.venueOrderAmount)).toBeGreaterThan(0);
  expect(preview.lines.some((line: any) => line.sourceType === 'VENUE_ORDER')).toBeTruthy();
  expect(preview.lines.some((line: any) => line.sourceType === 'SHOP_ORDER')).toBeFalsy();

  const { state } = await settleAndSplit(page, check.id, ['MANUAL_CARD', 'OTHER']);
  expect(state.payments.map((payment: any) => payment.method)).toEqual([
    'MANUAL_CARD',
    'OTHER',
  ]);
  await closePaidCheck(page, check.id);

  await page.goto(`/dashboard/${E2E.venues.restaurant}/checkout`);
  await expect(page.getByText('E2E Restaurant Golden', { exact: true })).toHaveCount(0);
});