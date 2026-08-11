import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const REDACTED = '[redacted]';

type GrowthPrivacyCounts = {
  customers: number;
  identitiesDeleted: number;
  loyaltyNotesRedacted: number;
  storedValueAccountsDetached: number;
  storedValueNotesRedacted: number;
  reviewProofsRevoked: number;
  mergeReasonsRedacted: number;
};

@Injectable()
export class GrowthPrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async redactByEmail(shopId: string, rawEmail: string): Promise<GrowthPrivacyCounts> {
    const email = rawEmail.trim().toLowerCase();
    if (!email) return this.emptyCounts();

    const [profiles, identities] = await Promise.all([
      this.prisma.customerProfile.findMany({
        where: { shopId, email },
        select: { id: true },
      }),
      this.prisma.customerIdentity.findMany({
        where: { shopId, kind: 'EMAIL', normalizedValue: email },
        select: { customerId: true },
      }),
    ]);
    const customerIds = [
      ...new Set([
        ...profiles.map((row) => row.id),
        ...identities.map((row) => row.customerId),
      ]),
    ];
    return this.redactCustomers(shopId, customerIds);
  }

  async redactAllForShop(shopId: string): Promise<GrowthPrivacyCounts> {
    const profiles = await this.prisma.customerProfile.findMany({
      where: { shopId },
      select: { id: true },
    });
    return this.redactCustomers(
      shopId,
      profiles.map((row) => row.id),
    );
  }

  private async redactCustomers(
    shopId: string,
    customerIds: string[],
  ): Promise<GrowthPrivacyCounts> {
    if (!customerIds.length) return this.emptyCounts();

    return this.prisma.$transaction(async (tx) => {
      const accounts = await tx.storedValueAccount.findMany({
        where: { shopId, customerId: { in: customerIds } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      const proofs = await tx.reviewVisitProof.findMany({
        where: { shopId, customerId: { in: customerIds } },
        select: { id: true },
      });

      for (const proof of proofs) {
        const revokedHash = createHash('sha256')
          .update(`privacy-redacted:${shopId}:${proof.id}`)
          .digest('hex');
        await tx.reviewVisitProof.update({
          where: { id: proof.id },
          data: {
            publicTokenHash: revokedHash,
            reviewId: null,
            consumedAt: new Date(),
          },
        });
      }

      const identities = await tx.customerIdentity.deleteMany({
        where: { shopId, customerId: { in: customerIds } },
      });
      const loyalty = await tx.loyaltyLedgerEntry.updateMany({
        where: { shopId, customerId: { in: customerIds } },
        data: { note: null },
      });
      const storedNotes = accountIds.length
        ? await tx.storedValueLedgerEntry.updateMany({
            where: { shopId, accountId: { in: accountIds } },
            data: { note: null },
          })
        : { count: 0 };
      const detachedAccounts = await tx.storedValueAccount.updateMany({
        where: { shopId, customerId: { in: customerIds } },
        data: { customerId: null },
      });
      const mergeAudits = await tx.customerMergeAudit.updateMany({
        where: {
          shopId,
          OR: [
            { canonicalCustomerId: { in: customerIds } },
            { mergedCustomerId: { in: customerIds } },
          ],
        },
        data: { reason: null },
      });
      const profiles = await tx.customerProfile.updateMany({
        where: { shopId, id: { in: customerIds } },
        data: {
          name: REDACTED,
          email: null,
          phone: null,
          marketingConsentAt: null,
          consentSource: null,
          notes: null,
        },
      });

      return {
        customers: profiles.count,
        identitiesDeleted: identities.count,
        loyaltyNotesRedacted: loyalty.count,
        storedValueAccountsDetached: detachedAccounts.count,
        storedValueNotesRedacted: storedNotes.count,
        reviewProofsRevoked: proofs.length,
        mergeReasonsRedacted: mergeAudits.count,
      };
    });
  }

  private emptyCounts(): GrowthPrivacyCounts {
    return {
      customers: 0,
      identitiesDeleted: 0,
      loyaltyNotesRedacted: 0,
      storedValueAccountsDetached: 0,
      storedValueNotesRedacted: 0,
      reviewProofsRevoked: 0,
      mergeReasonsRedacted: 0,
    };
  }
}
