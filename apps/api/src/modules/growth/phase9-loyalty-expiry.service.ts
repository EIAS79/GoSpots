import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashIdempotencyRequest } from '../../common/idempotency.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class Phase9LoyaltyExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async processDue(
    shopId: string,
    customerId: string,
    actorUserId?: string | null,
    at = new Date(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${shopId}:${customerId}`}))`;
      return this.processDueTx(tx, shopId, customerId, actorUserId, at);
    });
  }

  async processDueTx(
    tx: Prisma.TransactionClient,
    shopId: string,
    customerId: string,
    actorUserId?: string | null,
    at = new Date(),
  ) {
    const evidence = await tx.loyaltyEntryPolicyEvidence.findMany({
      where: { shopId, expiresAt: { not: null, lte: at } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!evidence.length) {
      return { expiredPoints: 0, createdEntries: [] as string[] };
    }

    const candidateIds = evidence.map((row) => row.ledgerEntryId);
    const earnRows = await tx.loyaltyLedgerEntry.findMany({
      where: {
        shopId,
        customerId,
        id: { in: candidateIds },
        type: 'EARN',
        points: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!earnRows.length) {
      return { expiredPoints: 0, createdEntries: [] as string[] };
    }

    const existingExpiries = await tx.loyaltyLedgerEntry.findMany({
      where: {
        shopId,
        customerId,
        sourceType: 'LOYALTY_EXPIRY',
        sourceId: { in: earnRows.map((row) => row.id) },
      },
      select: { sourceId: true },
    });
    const alreadyExpired = new Set(existingExpiries.map((row) => row.sourceId).filter(Boolean));

    const allRows = await tx.loyaltyLedgerEntry.findMany({
      where: { shopId, customerId },
      select: { points: true },
    });
    let balance = allRows.reduce((sum, row) => sum + row.points, 0);
    let expiredPoints = 0;
    const createdEntries: string[] = [];

    for (const earn of earnRows) {
      if (alreadyExpired.has(earn.id) || balance <= 0) continue;
      const amount = Math.min(earn.points, balance);
      if (amount <= 0) continue;
      const correlationId = `loyalty-expiry:${earn.id}`;
      const entry = await tx.loyaltyLedgerEntry.create({
        data: {
          shopId,
          customerId,
          type: 'EXPIRE',
          points: -amount,
          sourceType: 'LOYALTY_EXPIRY',
          sourceId: earn.id,
          correlationId,
          note: 'Automatic expiry under loyalty program policy',
          actorUserId: actorUserId ?? null,
        },
      });
      await tx.loyaltyEntryPolicyEvidence.create({
        data: {
          shopId,
          ledgerEntryId: entry.id,
          correlationId,
          requestHash: hashIdempotencyRequest({
            operation: 'loyalty-expiry',
            sourceEntryId: earn.id,
            points: amount,
          }),
          programVersion: evidence.find((row) => row.ledgerEntryId === earn.id)?.programVersion ?? 1,
          expiresAt: null,
        },
      });
      balance -= amount;
      expiredPoints += amount;
      createdEntries.push(entry.id);
    }

    return { expiredPoints, createdEntries };
  }
}
