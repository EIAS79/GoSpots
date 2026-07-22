import type { Prisma, PrismaClient } from '@prisma/client';
import {
  postReservationBilled,
  postShopLossCreated,
  postShopOrderCompleted,
  postTransactionCreated,
  postWalkInPlaySessionPaid,
} from './ledger-post.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Mirrors finance-analytics `isPaidWalkInPlaySession` (keep common free of module imports). */
function isPaidWalkInPlaySession(row: {
  status?: string;
  completedAt?: Date | null;
}): boolean {
  if (row.status === 'CANCELED') return false;
  return row.status === 'COMPLETED' || row.completedAt != null;
}

export type LedgerBackfillCounts = {
  shops: number;
  posted: number;
  duplicate: number;
  skipped: number;
  bySource: {
    shopOrders: number;
    transactions: number;
    reservations: number;
    playSessions: number;
    shopLosses: number;
  };
};

function emptyCounts(): LedgerBackfillCounts {
  return {
    shops: 0,
    posted: 0,
    duplicate: 0,
    skipped: 0,
    bySource: {
      shopOrders: 0,
      transactions: 0,
      reservations: 0,
      playSessions: 0,
      shopLosses: 0,
    },
  };
}

function tally(
  counts: LedgerBackfillCounts,
  result: 'posted' | 'duplicate' | 'skipped',
  source: keyof LedgerBackfillCounts['bySource'],
) {
  counts[result] += 1;
  if (result === 'posted') counts.bySource[source] += 1;
}

/**
 * Historical backfill (#6 Phase 3): mirror interim finance filters and
 * force-post missing LedgerEntry rows (idempotent unique key).
 * Does not flip LEDGER_DUAL_WRITE / LEDGER_READS.
 */
export async function backfillLedgerForShop(
  db: DbClient,
  shopId: string,
  shopCurrency: string,
  opts: { dryRun?: boolean } = {},
): Promise<LedgerBackfillCounts> {
  const counts = emptyCounts();
  counts.shops = 1;
  const currencyFallback = (shopCurrency || 'EUR').toUpperCase();
  const dryRun = opts.dryRun === true;

  const [orders, transactions, reservations, playSessions, losses] =
    await Promise.all([
      db.shopOrder.findMany({
        where: { shopId, status: 'COMPLETED', archivedAt: null },
        select: {
          id: true,
          total: true,
          currency: true,
          completedAt: true,
          createdById: true,
        },
      }),
      db.transaction.findMany({
        where: { shopId },
        select: {
          id: true,
          kind: true,
          amount: true,
          currency: true,
          createdAt: true,
          createdById: true,
        },
      }),
      db.reservation.findMany({
        where: { shopId, billedAmount: { not: null }, billedAt: { not: null } },
        select: {
          id: true,
          billedAmount: true,
          billedAt: true,
          resourceId: true,
          currency: true,
        },
      }),
      db.playSession.findMany({
        where: {
          shopId,
          reservationId: null,
          archivedAt: null,
          status: { not: 'CANCELED' },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          completedAt: true,
          updatedAt: true,
          status: true,
          reservationId: true,
          createdById: true,
        },
      }),
      db.shopLoss.findMany({
        where: { shopId },
        select: {
          id: true,
          amount: true,
          currency: true,
          occurredAt: true,
          createdById: true,
        },
      }),
    ]);

  for (const o of orders) {
    if (!o.completedAt) {
      counts.skipped += 1;
      continue;
    }
    if (dryRun) {
      counts.posted += 1;
      counts.bySource.shopOrders += 1;
      continue;
    }
    const result = await postShopOrderCompleted(
      db,
      {
        shopId,
        orderId: o.id,
        total: o.total,
        currency: o.currency ?? currencyFallback,
        completedAt: o.completedAt,
        createdById: o.createdById,
      },
      { force: true },
    );
    tally(counts, result, 'shopOrders');
  }

  for (const tx of transactions) {
    if (dryRun) {
      counts.posted += 1;
      counts.bySource.transactions += 1;
      continue;
    }
    const result = await postTransactionCreated(
      db,
      {
        shopId,
        transactionId: tx.id,
        kind: tx.kind,
        amount: tx.amount,
        currency: tx.currency ?? currencyFallback,
        createdAt: tx.createdAt,
        createdById: tx.createdById,
      },
      { force: true },
    );
    tally(counts, result, 'transactions');
  }

  for (const r of reservations) {
    if (r.billedAmount == null || r.billedAt == null) {
      counts.skipped += 1;
      continue;
    }
    if (dryRun) {
      counts.posted += 1;
      counts.bySource.reservations += 1;
      continue;
    }
    const result = await postReservationBilled(
      db,
      {
        shopId,
        reservationId: r.id,
        billedAmount: r.billedAmount,
        currency: r.currency ?? currencyFallback,
        billedAt: r.billedAt,
        resourceId: r.resourceId,
      },
      { force: true },
    );
    tally(counts, result, 'reservations');
  }

  for (const p of playSessions) {
    if (!isPaidWalkInPlaySession(p)) {
      counts.skipped += 1;
      continue;
    }
    const occurredAt = p.completedAt ?? p.updatedAt;
    if (dryRun) {
      counts.posted += 1;
      counts.bySource.playSessions += 1;
      continue;
    }
    const result = await postWalkInPlaySessionPaid(
      db,
      {
        shopId,
        sessionId: p.id,
        amount: p.amount,
        currency: p.currency ?? currencyFallback,
        completedAt: occurredAt,
        reservationId: p.reservationId,
        createdById: p.createdById,
      },
      { force: true },
    );
    tally(counts, result, 'playSessions');
  }

  for (const loss of losses) {
    if (dryRun) {
      counts.posted += 1;
      counts.bySource.shopLosses += 1;
      continue;
    }
    const result = await postShopLossCreated(
      db,
      {
        shopId,
        lossId: loss.id,
        amount: loss.amount,
        currency: loss.currency ?? currencyFallback,
        occurredAt: loss.occurredAt,
        createdById: loss.createdById,
      },
      { force: true },
    );
    tally(counts, result, 'shopLosses');
  }

  return counts;
}

export async function backfillLedgerAllShops(
  db: DbClient,
  opts: { dryRun?: boolean; shopId?: string } = {},
): Promise<LedgerBackfillCounts> {
  const shops = await db.shop.findMany({
    where: opts.shopId ? { id: opts.shopId } : undefined,
    select: { id: true, currency: true },
    orderBy: { id: 'asc' },
  });

  const total = emptyCounts();
  for (const shop of shops) {
    const part = await backfillLedgerForShop(
      db,
      shop.id,
      shop.currency ?? 'EUR',
      { dryRun: opts.dryRun },
    );
    total.shops += part.shops;
    total.posted += part.posted;
    total.duplicate += part.duplicate;
    total.skipped += part.skipped;
    for (const key of Object.keys(part.bySource) as Array<
      keyof LedgerBackfillCounts['bySource']
    >) {
      total.bySource[key] += part.bySource[key];
    }
  }
  return total;
}
