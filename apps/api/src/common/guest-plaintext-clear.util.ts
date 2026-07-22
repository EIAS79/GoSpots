/**
 * Post dual-read-window cleanup: clear leftover `guestToken` plaintext when
 * `guestTokenHash` is already present (Reservation / EventRequest / GuestChat).
 *
 * Safe by design:
 * - Never touches rows that still lack a hash (legacy plaintext-only links).
 * - Does not drop columns or rewrite guest-token lookup code.
 * - Dry-run by default via {@link clearLeftoverGuestPlaintext}.
 *
 * Used by `scripts/clear-guest-plaintext.ts` (pnpm `clear:guest-plaintext`).
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Rows eligible for plaintext wipe: both plaintext and hash set. */
export const GUEST_PLAINTEXT_WITH_HASH_WHERE = {
  guestToken: { not: null },
  guestTokenHash: { not: null },
} as const;

export type GuestPlaintextClearCounts = {
  reservation: number;
  eventRequest: number;
  guestChat: number;
  total: number;
};

export type GuestPlaintextClearResult = {
  /** True when no writes were performed. */
  dryRun: boolean;
  /** Rows matching plaintext+hash (counted before any write). */
  counted: GuestPlaintextClearCounts;
  /** Rows updated when apply ran; omitted on dry-run. */
  cleared?: GuestPlaintextClearCounts;
};

function sumCounts(
  reservation: number,
  eventRequest: number,
  guestChat: number,
): GuestPlaintextClearCounts {
  return {
    reservation,
    eventRequest,
    guestChat,
    total: reservation + eventRequest + guestChat,
  };
}

/** Count leftover plaintext rows that already have a hash (read-only). */
export async function countLeftoverGuestPlaintext(
  db: DbClient,
): Promise<GuestPlaintextClearCounts> {
  const [reservation, eventRequest, guestChat] = await Promise.all([
    db.reservation.count({ where: GUEST_PLAINTEXT_WITH_HASH_WHERE }),
    db.eventRequest.count({ where: GUEST_PLAINTEXT_WITH_HASH_WHERE }),
    db.guestChat.count({ where: GUEST_PLAINTEXT_WITH_HASH_WHERE }),
  ]);
  return sumCounts(reservation, eventRequest, guestChat);
}

/**
 * Clear leftover plaintext only where hash exists.
 *
 * @param opts.dryRun default `true` — count only, no writes
 * @param opts.apply set `true` (and dryRun false) to null out plaintext
 */
export async function clearLeftoverGuestPlaintext(
  db: DbClient,
  opts?: { dryRun?: boolean; apply?: boolean },
): Promise<GuestPlaintextClearResult> {
  const apply = opts?.apply === true && opts?.dryRun !== true;
  const dryRun = !apply;

  const counted = await countLeftoverGuestPlaintext(db);

  if (dryRun) {
    return { dryRun: true, counted };
  }

  const [reservation, eventRequest, guestChat] = await Promise.all([
    db.reservation.updateMany({
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
      data: { guestToken: null },
    }),
    db.eventRequest.updateMany({
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
      data: { guestToken: null },
    }),
    db.guestChat.updateMany({
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
      data: { guestToken: null },
    }),
  ]);

  const cleared = sumCounts(
    reservation.count,
    eventRequest.count,
    guestChat.count,
  );

  return { dryRun: false, counted, cleared };
}
