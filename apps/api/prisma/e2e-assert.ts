import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Browser E2E database assertion failed: ${message}`);
}

async function assertClosedCheck(
  label: string,
  match: 'exact' | 'prefix' = 'exact',
) {
  const check = await prisma.guestCheck.findFirst({
    where: match === 'prefix' ? { label: { startsWith: label } } : { label },
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
  const successful = settlement.payments.filter(
    (payment) => payment.status === 'SUCCESS',
  );
  invariant(
    successful.length >= 1,
    `${label} has no successful Checkout payment`,
  );
  const paid = successful.reduce(
    (sum, payment) => sum.add(payment.amount),
    settlement.total.mul(0),
  );
  invariant(
    paid.eq(settlement.total),
    `${label} successful payments do not conserve settlement total`,
  );
  invariant(settlement.amountDue.isZero(), `${label} amountDue is not zero`);
  return { check, settlement };
}

async function main() {
  const gaming = await assertClosedCheck('E2E Gaming Golden');
  invariant(
    gaming.settlement.payments.length === 2,
    'gaming split did not create exactly two payment rows',
  );

  // Phase 4 makes LedgerEntry the canonical monetary authority. The old
  // LEDGER_DUAL_WRITE feature flag no longer controls whether revenue facts
  // are written. Prove that the browser golden path produced one durable SALE
  // fact for each common gaming revenue source, with GuestCheck lineage.
  const gamingSaleFacts = await prisma.ledgerFactMetadata.findMany({
    where: {
      shopId: gaming.check.shopId,
      guestCheckId: gaming.check.id,
      factType: 'SALE',
      referenceType: {
        in: ['SHOP_ORDER', 'PLAY_SESSION', 'OPERATIONS_SESSION'],
      },
    },
  });
  const gamingLedgerRows = await prisma.ledgerEntry.findMany({
    where: { id: { in: gamingSaleFacts.map((fact) => fact.ledgerEntryId) } },
  });
  for (const referenceType of [
    'SHOP_ORDER',
    'PLAY_SESSION',
    'OPERATIONS_SESSION',
  ] as const) {
    const facts = gamingSaleFacts.filter(
      (fact) => fact.referenceType === referenceType,
    );
    invariant(
      facts.length === 1,
      `gaming ${referenceType} did not produce exactly one canonical SALE fact`,
    );
    const ledger = gamingLedgerRows.find(
      (row) => row.id === facts[0].ledgerEntryId,
    );
    invariant(
      ledger,
      `gaming ${referenceType} canonical LedgerEntry is missing`,
    );
    invariant(
      ledger.kind === 'SALE',
      `gaming ${referenceType} ledger kind is not SALE`,
    );
    invariant(
      ledger.guestCheckId === gaming.check.id,
      `gaming ${referenceType} ledger fact lost GuestCheck lineage`,
    );
  }
  const duplicateGamingLedgerKeys = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT "shopId","sourceType","sourceId","kind",COUNT(*)
      FROM "LedgerEntry"
      WHERE "shopId"=${gaming.check.shopId}
      GROUP BY "shopId","sourceType","sourceId","kind"
      HAVING COUNT(*) > 1
    ) duplicates
  `;
  invariant(
    Number(duplicateGamingLedgerKeys[0]?.count ?? 0) === 0,
    'gaming path created duplicate canonical ledger source keys',
  );

  await assertClosedCheck('E2E Restaurant Golden');
  const restaurantTicket = await prisma.prepTicket.findFirst({
    where: { shopId: 'e2e-shop-restaurant', status: 'COLLECTED' },
  });
  invariant(restaurantTicket, 'restaurant KDS ticket did not reach COLLECTED');

  await assertClosedCheck('E2E Mixed Golden', 'prefix');

  const paymentOperation = await prisma.paymentOperation.findFirst({
    where: {
      shopId: 'e2e-shop-payment',
      provider: 'fake',
      idempotencyKey: { startsWith: 'e2e-payment-timeout-captured-' },
    },
    orderBy: { createdAt: 'desc' },
  });
  invariant(paymentOperation, 'fake UNKNOWN payment operation is missing');
  invariant(paymentOperation.idempotencyKey.startsWith('e2e-payment-timeout-captured-'), 'unknown-payment E2E key prefix differs from the browser scenario');
  invariant(
    paymentOperation.state === 'CAPTURED',
    'fake UNKNOWN payment did not reconcile to CAPTURED',
  );
  const sameKeyCount = await prisma.paymentOperation.count({
    where: {
      shopId: 'e2e-shop-payment',
      provider: 'fake',
      idempotencyKey: paymentOperation.idempotencyKey,
    },
  });
  invariant(
    sameKeyCount === 1,
    'payment replay created a duplicate provider operation',
  );

  // W1 checkout-specific provider capture/split/refund persisted state proof.
  // Unlike a mocked provider service, these are real records from the E2E PG17 database.
  const w1Check = await prisma.guestCheck.findFirst({
    where: {
      shopId: 'e2e-shop-payment',
      label: { startsWith: 'W1 Checkout Provider ' },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      settlements: {
        include: { payments: { include: { allocations: true } } },
      },
    },
  });
  invariant(w1Check, 'W1 checkout provider E2E check is missing');
  const w1Settlement = w1Check.settlements[0];
  invariant(w1Settlement, 'W1 provider check has no checkout settlement');
  const w1Payments = w1Settlement.payments.filter(
    (p) => p.status === 'SUCCESS',
  );
  invariant(
    w1Payments.length === 2,
    'W1 captured + cash split must create exactly two successful checkout payments',
  );
  const w1Card = w1Payments.find((p) => p.method === 'MANUAL_CARD');
  const w1Cash = w1Payments.find((p) => p.method === 'CASH');
  invariant(
    w1Card && w1Cash,
    'W1 split must contain provider-linked card and separate cash payment',
  );
  const w1Operation = await prisma.paymentOperation.findFirst({
    where: {
      shopId: 'e2e-shop-payment',
      settlementId: w1Settlement.id,
      provider: 'fake',
    },
    include: { refunds: { include: { allocations: true } } },
  });
  invariant(w1Operation, 'W1 checkout captured operation was not persisted');
  invariant(
    w1Operation.checkoutPaymentId === w1Card.id,
    'W1 checkout card success has no corresponding linked provider operation',
  );
  invariant(
    w1Operation.providerPaymentId !== null,
    'W1 operation lacks a confirmed provider reference',
  );
  const w1CapturedMoney = w1Card.allocations.reduce(
    (sum, row) => sum.add(row.amount),
    w1Card.amount.mul(0),
  );
  invariant(
    w1CapturedMoney.eq(w1Operation.amount),
    'W1 captured allocation and provider operation disagree',
  );
  const w1Paid = w1Payments.reduce(
    (sum, row) => sum.add(row.amount),
    w1Settlement.total.mul(0),
  );
  invariant(
    w1Paid.eq(w1Settlement.total),
    'W1 cash/card split does not conserve settlement total',
  );
  invariant(
    w1Settlement.amountDue.isZero(),
    'W1 checkout settlement must have zero due',
  );
  invariant(
    w1Operation.refunds.length === 1,
    'W1 refund replay must not create duplicate refund records',
  );
  const w1Refund = w1Operation.refunds[0];
  invariant(
    w1Refund.state === 'SUCCEEDED',
    'W1 provider refund must be independently confirmed',
  );
  invariant(
    w1Refund.amount.eq(w1Operation.amount),
    'W1 full card refund must match original provider captured amount',
  );
  const w1RefundTotal = w1Refund.allocations.reduce(
    (sum, row) => sum.add(row.amount),
    w1Refund.amount.mul(0),
  );
  invariant(
    w1RefundTotal.eq(w1Refund.amount),
    'W1 refund allocations do not reconcile to provider refund amount',
  );
  invariant(
    w1Operation.state === 'REFUNDED' ||
      w1Operation.state === 'PARTIALLY_REFUNDED',
    'W1 operation must reflect acknowledged provider refund state',
  );

  const shift = await prisma.cashSession.findFirst({
    where: { shopId: 'e2e-shop-cash', status: 'CLOSED' },
    include: { movements: true, counts: true, approvals: true },
  });
  invariant(shift, 'cash E2E shift did not close');
  for (const movementType of [
    'CASH_SALE',
    'PAY_IN',
    'PAY_OUT',
    'CASH_REFUND',
  ] as const) {
    invariant(
      shift.movements.some((movement) => movement.type === movementType),
      `cash shift is missing ${movementType}`,
    );
  }
  invariant(
    shift.counts.length === 1,
    'cash shift did not persist one blind count',
  );
  invariant(shift.counts[0].blindCount, 'cash shift count was not blind');
  invariant(
    shift.approvals.some((approval) => approval.status === 'APPROVED'),
    'cash variance was not approved',
  );
  invariant(
    shift.variance?.toFixed(2) === '2.00',
    'cash variance does not equal the deliberate 2.00 PLN mismatch',
  );

  const offlineOrders = await prisma.venueOrder.findMany({
    where: { shopId: 'e2e-shop-offline', resourceId: 'e2e-resource-offline-1' },
  });
  invariant(
    offlineOrders.length === 1,
    'Offline Lite replay did not produce exactly one cloud order',
  );
  const activeOfflineSessions = await prisma.operationsSession.count({
    where: { shopId: 'e2e-shop-offline', status: { in: ['ACTIVE', 'PAUSED'] } },
  });
  invariant(
    activeOfflineSessions === 0,
    'Offline Lite replay left an active cloud session',
  );

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
