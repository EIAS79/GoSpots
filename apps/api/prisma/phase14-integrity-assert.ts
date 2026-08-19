import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const amount = '100.0000';
const currency = 'PLN';

async function main() {
  const stamp = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `phase14-${stamp}@example.invalid`,
      passwordHash: 'phase14-fixture-not-a-login-secret',
      name: 'Phase 14 fixture',
    },
  });
  const shop = await prisma.shop.create({
    data: {
      slug: `phase14-${stamp}`,
      dashboardKey: `phase14-dashboard-${stamp}`,
      name: 'Phase 14 Integrity Fixture',
      ownerId: owner.id,
      currency,
      timezone: 'Europe/Warsaw',
      businessDayStartMinutes: 240,
    },
  });
  const check = await prisma.guestCheck.create({
    data: {
      shopId: shop.id,
      status: 'OPEN',
      currency,
      partySize: 2,
      openedAt: new Date('2026-08-19T10:00:00Z'),
    },
  });
  const settlement = await prisma.checkSettlement.create({
    data: {
      shopId: shop.id,
      guestCheckId: check.id,
      state: 'PAID',
      checkVersion: 1,
      sourceHash: `phase14-${stamp}`,
      subtotal: amount,
      adjustments: '0.0000',
      taxAmount: '0.0000',
      depositAmount: '0.0000',
      total: amount,
      amountDue: '0.0000',
      currency,
      createdAt: new Date('2026-08-19T10:05:00Z'),
    },
  });
  await prisma.guestCheck.update({
    where: { id: check.id },
    data: {
      status: 'SETTLED',
      currentSettlementId: settlement.id,
      settledAt: new Date('2026-08-19T10:05:00Z'),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      shopId: shop.id,
      settlementId: settlement.id,
      method: 'CASH',
      status: 'SUCCESS',
      amount,
      currency,
      correlationId: `phase14-payment-${stamp}`,
      succeededAt: new Date('2026-08-19T10:05:00Z'),
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      shopId: shop.id,
      currency,
      amount,
      kind: 'SALE',
      sourceType: 'TRANSACTION',
      sourceId: `phase14-source-${stamp}`,
      occurredAt: new Date('2026-08-19T10:05:00Z'),
      guestCheckId: check.id,
    },
  });
  const drawer = await prisma.cashDrawer.create({
    data: { shopId: shop.id, name: `Fixture ${stamp}` },
  });
  const cashSession = await prisma.cashSession.create({
    data: {
      shopId: shop.id,
      drawerId: drawer.id,
      status: 'CLOSED',
      openedById: owner.id,
      openedAt: new Date('2026-08-19T09:00:00Z'),
      openingFloat: '0.0000',
      currency,
      closedExpectedCash: amount,
      countedCash: amount,
      variance: '0.0000',
      closedAt: new Date('2026-08-19T11:00:00Z'),
      closedById: owner.id,
    },
  });
  await prisma.cashMovement.create({
    data: {
      shopId: shop.id,
      cashSessionId: cashSession.id,
      type: 'CASH_SALE',
      amount,
      currency,
      reasonCategory: 'SALE',
      actorId: owner.id,
      paymentId: payment.id,
      occurredAt: new Date('2026-08-19T10:05:00Z'),
    },
  });

  const [settlementAgg, paymentAgg, ledgerAgg, cashAgg, finalCheck] = await Promise.all([
    prisma.checkSettlement.aggregate({ where: { shopId: shop.id, state: 'PAID' }, _sum: { total: true } }),
    prisma.payment.aggregate({ where: { shopId: shop.id, status: 'SUCCESS' }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { shopId: shop.id, kind: 'SALE' }, _sum: { amount: true } }),
    prisma.cashMovement.aggregate({ where: { shopId: shop.id, type: 'CASH_SALE' }, _sum: { amount: true } }),
    prisma.guestCheck.findUnique({ where: { id: check.id }, select: { status: true, currentSettlementId: true } }),
  ]);
  const values = {
    checkout: settlementAgg._sum.total?.toFixed(4),
    payment: paymentAgg._sum.amount?.toFixed(4),
    ledger: ledgerAgg._sum.amount?.toFixed(4),
    cash: cashAgg._sum.amount?.toFixed(4),
  };
  if (new Set(Object.values(values)).size !== 1 || values.checkout !== amount) {
    throw new Error(`Phase 14 canonical-money reconciliation failed: ${JSON.stringify(values)}`);
  }
  if (finalCheck?.status !== 'SETTLED' || finalCheck.currentSettlementId !== settlement.id) {
    throw new Error('Phase 14 GuestCheck -> current settlement invariant failed');
  }

  const otherOwner = await prisma.user.create({
    data: {
      email: `phase14-other-${stamp}@example.invalid`,
      passwordHash: 'phase14-fixture-not-a-login-secret',
    },
  });
  const otherShop = await prisma.shop.create({
    data: {
      slug: `phase14-other-${stamp}`,
      dashboardKey: `phase14-other-dashboard-${stamp}`,
      name: 'Phase 14 Other Tenant',
      ownerId: otherOwner.id,
      currency,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      shopId: otherShop.id,
      currency,
      amount: '999.0000',
      kind: 'SALE',
      sourceType: 'TRANSACTION',
      sourceId: `phase14-other-source-${stamp}`,
      occurredAt: new Date('2026-08-19T10:05:00Z'),
    },
  });
  const isolated = await prisma.ledgerEntry.aggregate({
    where: { shopId: shop.id, kind: 'SALE' },
    _sum: { amount: true },
  });
  if (isolated._sum.amount?.toFixed(4) !== amount) {
    throw new Error('Phase 14 tenant-scoped source facts leaked across shops');
  }

  console.log(JSON.stringify({ ok: true, values, tenantIsolation: true }));
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
