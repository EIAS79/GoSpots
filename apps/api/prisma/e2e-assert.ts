import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Browser E2E database assertion failed: ${message}`);
}

function ledgerDualWriteEnabled() {
  const value = process.env.LEDGER_DUAL_WRITE?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

async function assertClosedCheck(label: string) {
  const check = await prisma.guestCheck.findFirst({
    where: { label },
    include: {
      settlements: { include: { payments: true } },
      shopOrders: { select: { id: true } },
      playSessions: { select: { id: true } },
      reservations: { select: { id: true } },
    },
  });
  invariant(check, `${label} is missing`);
  invariant(check.status === 'SETTLED', `${label} is not SETTLED`);
  const settlement = [...check.settlements].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  invariant(settlement, `${label} has no immutable settlement`);
  invariant(settlement.state === 'CLOSED', `${label} settlement is not CLOSED`);
  const successful = settlement.payments.filter((payment) => payment.status === 'SUCCESS');
  invariant(successful.length >= 1, `${label} has no successful Checkout payment`);
  const paid = successful.reduce((sum, payment) => sum.add(payment.amount), settlement.total.mul(0));
  invariant(paid.eq(settlement.total), `${label} successful payments do not conserve settlement total`);
  invariant(settlement.amountDue.isZero(), `${label} amountDue is not zero`);
  return { check, settlement };
}

async function main() {
  const gaming = await assertClosedCheck('E2E Gaming Golden');
  invariant(gaming.settlement.payments.length === 2, 'gaming split did not create exactly two payment rows');
  const sourceIds = [
    ...gaming.check.shopOrders.map((row) => row.id),
    ...gaming.check.playSessions.map((row) => row.id),
    ...gaming.check.reservations.map((row) => row.id),
  ];
  const ledgerRows = await prisma.ledgerEntry.findMany({
    where: { shopId: gaming.check.shopId, sourceId: { in: sourceIds } },
  });
  if (ledgerDualWriteEnabled()) {
    invariant(ledgerRows.length >= 2, 'enabled ledger dual-write did not represent gaming financial sources');
  } else {
    invariant(ledgerRows.length === 0, 'ledger rows were written while LEDGER_DUAL_WRITE is disabled');
  }

  await assertClosedCheck('E2E Restaurant Golden');
  const restaurantTicket = await prisma.prepTicket.findFirst({
    where: { shopId: 'e2e-shop-restaurant', status: 'COLLECTED' },
  });
  invariant(restaurantTicket, 'restaurant KDS ticket did not reach COLLECTED');

  await assertClosedCheck('E2E Mixed Golden');

  const paymentOperation = await prisma.paymentOperation.findFirst({
    where: {
      shopId: 'e2e-shop-payment',
      provider: 'fake',
      idempotencyKey: 'e2e-payment-timeout-captured',
    },
  });
  invariant(paymentOperation, 'fake UNKNOWN payment operation is missing');
  invariant(paymentOperation.state === 'CAPTURED', 'fake UNKNOWN payment did not reconcile to CAPTURED');
  const sameKeyCount = await prisma.paymentOperation.count({
    where: {
      shopId: 'e2e-shop-payment',
      provider: 'fake',
      idempotencyKey: 'e2e-payment-timeout-captured',
    },
  });
  invariant(sameKeyCount === 1, 'payment replay created a duplicate provider operation');

  const shift = await prisma.cashSession.findFirst({
    where: { shopId: 'e2e-shop-cash', status: 'CLOSED' },
    include: { movements: true, counts: true, approvals: true },
  });
  invariant(shift, 'cash E2E shift did not close');
  for (const movementType of ['CASH_SALE', 'PAY_IN', 'PAY_OUT', 'CASH_REFUND'] as const) {
    invariant(
      shift.movements.some((movement) => movement.type === movementType),
      `cash shift is missing ${movementType}`,
    );
  }
  invariant(shift.counts.length === 1, 'cash shift did not persist one blind count');
  invariant(shift.counts[0].blindCount, 'cash shift count was not blind');
  invariant(shift.approvals.some((approval) => approval.status === 'APPROVED'), 'cash variance was not approved');
  invariant(shift.variance?.toFixed(2) === '2.00', 'cash variance does not equal the deliberate 2.00 PLN mismatch');

  const offlineOrders = await prisma.venueOrder.findMany({
    where: { shopId: 'e2e-shop-offline', resourceId: 'e2e-resource-offline-1' },
  });
  invariant(offlineOrders.length === 1, 'Offline Lite replay did not produce exactly one cloud order');
  const activeOfflineSessions = await prisma.operationsSession.count({
    where: { shopId: 'e2e-shop-offline', status: { in: ['ACTIVE', 'PAUSED'] } },
  });
  invariant(activeOfflineSessions === 0, 'Offline Lite replay left an active cloud session');

  console.log('Browser E2E database assertions passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
