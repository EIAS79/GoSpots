import { Prisma } from '@prisma/client';
import type {
  LedgerChannel,
  LedgerKind,
  LedgerSourceType,
  PrismaClient,
  TransactionKind,
} from '@prisma/client';
import { effectiveMoneyCurrency } from './currency-stamp.util';
import { toPrismaDecimal, type MoneyInput } from './money.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Phase 2 dual-write gate — default off until soak. */
export function isLedgerDualWriteEnabled(): boolean {
  const v = process.env.LEDGER_DUAL_WRITE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export type LedgerPostInput = {
  shopId: string;
  currency: string;
  amount: MoneyInput;
  kind: LedgerKind;
  channel?: LedgerChannel | null;
  sourceType: LedgerSourceType;
  sourceId: string;
  occurredAt: Date;
  createdById?: string | null;
  guestCheckId?: string | null;
};

/**
 * Idempotent ledger post (unique shopId+sourceType+sourceId+kind).
 * No-ops when LEDGER_DUAL_WRITE is off. Swallows P2002 races.
 */
export async function postLedgerEntry(
  db: DbClient,
  input: LedgerPostInput,
): Promise<'posted' | 'duplicate' | 'skipped'> {
  if (!isLedgerDualWriteEnabled()) return 'skipped';

  const currency =
    effectiveMoneyCurrency(input.currency, input.currency) || 'EUR';
  const amount = toPrismaDecimal(input.amount);
  if (!amount.isFinite()) {
    throw new TypeError('postLedgerEntry: non-finite amount');
  }

  try {
    await db.ledgerEntry.create({
      data: {
        shopId: input.shopId,
        currency,
        amount,
        kind: input.kind,
        channel: input.channel ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        occurredAt: input.occurredAt,
        createdById: input.createdById ?? null,
        guestCheckId: input.guestCheckId ?? null,
      },
    });
    return 'posted';
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return 'duplicate';
    }
    throw err;
  }
}

export async function postShopOrderCompleted(
  db: DbClient,
  args: {
    shopId: string;
    orderId: string;
    total: MoneyInput;
    currency: string;
    completedAt: Date;
    createdById?: string | null;
  },
): Promise<'posted' | 'duplicate' | 'skipped'> {
  return postLedgerEntry(db, {
    shopId: args.shopId,
    currency: args.currency,
    amount: args.total,
    kind: 'SALE',
    channel: 'MENU_ORDERS',
    sourceType: 'SHOP_ORDER',
    sourceId: args.orderId,
    occurredAt: args.completedAt,
    createdById: args.createdById,
  });
}

export function ledgerKindForTransaction(
  kind: TransactionKind,
): LedgerKind {
  switch (kind) {
    case 'SALE':
      return 'SALE';
    case 'REFUND':
      return 'REFUND';
    case 'EXPENSE':
      return 'EXPENSE';
    case 'ADJUSTMENT':
      return 'ADJUSTMENT';
    default:
      return 'ADJUSTMENT';
  }
}

export async function postTransactionCreated(
  db: DbClient,
  args: {
    shopId: string;
    transactionId: string;
    kind: TransactionKind;
    amount: MoneyInput;
    currency: string;
    createdAt: Date;
    createdById?: string | null;
  },
): Promise<'posted' | 'duplicate' | 'skipped'> {
  const ledgerKind = ledgerKindForTransaction(args.kind);
  const channel: LedgerChannel | null =
    ledgerKind === 'SALE' || ledgerKind === 'REFUND' ? 'QUICK_SALES' : null;
  return postLedgerEntry(db, {
    shopId: args.shopId,
    currency: args.currency,
    amount: args.amount,
    kind: ledgerKind,
    channel,
    sourceType: 'TRANSACTION',
    sourceId: args.transactionId,
    occurredAt: args.createdAt,
    createdById: args.createdById,
  });
}

export async function postReservationBilled(
  db: DbClient,
  args: {
    shopId: string;
    reservationId: string;
    billedAmount: MoneyInput;
    currency: string;
    billedAt: Date;
    /** When set → PLAY_SESSIONS; dining/other (null resource) → RESERVATIONS */
    resourceId: string | null;
    createdById?: string | null;
  },
): Promise<'posted' | 'duplicate' | 'skipped'> {
  return postLedgerEntry(db, {
    shopId: args.shopId,
    currency: args.currency,
    amount: args.billedAmount,
    kind: 'SALE',
    channel: args.resourceId ? 'PLAY_SESSIONS' : 'RESERVATIONS',
    sourceType: 'RESERVATION',
    sourceId: args.reservationId,
    occurredAt: args.billedAt,
    createdById: args.createdById,
  });
}

export async function postWalkInPlaySessionPaid(
  db: DbClient,
  args: {
    shopId: string;
    sessionId: string;
    amount: MoneyInput;
    currency: string;
    completedAt: Date;
    /** Linked play must never post — payment lives on Reservation */
    reservationId: string | null | undefined;
    createdById?: string | null;
  },
): Promise<'posted' | 'duplicate' | 'skipped'> {
  if (args.reservationId) return 'skipped';
  return postLedgerEntry(db, {
    shopId: args.shopId,
    currency: args.currency,
    amount: args.amount,
    kind: 'SALE',
    channel: 'PLAY_SESSIONS',
    sourceType: 'PLAY_SESSION',
    sourceId: args.sessionId,
    occurredAt: args.completedAt,
    createdById: args.createdById,
  });
}

export async function postShopLossCreated(
  db: DbClient,
  args: {
    shopId: string;
    lossId: string;
    amount: MoneyInput;
    currency: string;
    occurredAt: Date;
    createdById?: string | null;
  },
): Promise<'posted' | 'duplicate' | 'skipped'> {
  return postLedgerEntry(db, {
    shopId: args.shopId,
    currency: args.currency,
    amount: args.amount,
    kind: 'LOSS',
    channel: null,
    sourceType: 'SHOP_LOSS',
    sourceId: args.lossId,
    occurredAt: args.occurredAt,
    createdById: args.createdById,
  });
}
