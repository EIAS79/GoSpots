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
  closePaidCheck,
} from '../helpers/app';

test('@smoke E2E-03 mixed visit conserves play food booking and split totals', async ({ page }) => {
  await loginOwner(page);
  await bindVenue(page, E2E.venues.mixed);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const check = await createGuestCheckFromUi(
    page,
    E2E.venues.mixed,
    `E2E Mixed Golden ${runId}`,
  );

  await endedPlaySession(
    page,
    check.id,
    'e2e-resource-mixed-1',
    `E2E Mixed Play ${runId}`,
    24,
  );
  await completeLegacyOrder(
    page,
    check.id,
    'e2e-item-mixed',
    `E2E Mixed Drinks ${runId}`,
  );

  // Use a broad future slot so Playwright retries cannot overlap residue left by
  // an earlier failed attempt on the shared seeded resource.
  const randomFutureMinutes =
    30 * 24 * 60 + Math.floor(Math.random() * 3 * 365 * 24 * 60);
  const startsAt = new Date(Date.now() + randomFutureMinutes * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const reservation = await api<any>(page, 'POST', '/reservations', {
    data: {
      resourceId: 'e2e-resource-mixed-2',
      guestName: `Mixed Booking Guest ${runId}`,
      partySize: 2,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: 'CONFIRMED',
      notes: `E2E mixed booking source ${runId}`,
    },
  });
  await api(page, 'POST', `/guest-checks/${check.id}/attach`, {
    data: { reservationId: reservation.id },
  });

  const preview = await api<any>(page, 'POST', `/checkout/checks/${check.id}/preview`, {
    data: {},
  });
  const sourceTypes = new Set(preview.lines.map((line: any) => line.sourceType));
  expect(sourceTypes.has('PLAY_SESSION')).toBeTruthy();
  expect(sourceTypes.has('SHOP_ORDER')).toBeTruthy();
  expect(sourceTypes.has('RESERVATION')).toBeTruthy();

  const { settlement, state } = await settleAndSplit(page, check.id, ['MANUAL_CARD', 'OTHER']);
  const paid = state.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
  expect(paid).toBeCloseTo(Number(settlement.total), 4);
  await closePaidCheck(page, check.id);

  await page.goto(`/dashboard/${E2E.venues.mixed}/checkout`);
  await expect(page.getByText(`E2E Mixed Golden ${runId}`, { exact: true })).toHaveCount(0);
});