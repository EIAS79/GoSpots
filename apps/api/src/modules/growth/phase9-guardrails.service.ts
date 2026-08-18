import { Injectable, NotFoundException } from '@nestjs/common';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import type { QuoteDto, SnapshotDto } from './growth.types';
import { effectiveMembershipState, accountExpired } from './phase9.rules';
import { Phase9LoyaltyExpiryService } from './phase9-loyalty-expiry.service';

@Injectable()
export class Phase9GuardrailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyExpiry: Phase9LoyaltyExpiryService,
  ) {}

  async normalizeQuote<T extends QuoteDto | SnapshotDto>(
    actor: JwtAccessPayload,
    dto: T,
  ): Promise<T> {
    const shopId = requireShopId(actor);
    const customerId = dto.context?.customerId;
    let isMember = false;
    if (customerId) {
      const customer = await this.prisma.customerProfile.findFirst({
        where: { id: customerId, shopId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found.');
      const membership = await this.prisma.customerMembership.findFirst({
        where: { shopId, customerId },
      });
      isMember = Boolean(
        membership &&
          effectiveMembershipState(membership.status, membership.expiresAt) ===
            'ACTIVE',
      );
      await this.loyaltyExpiry.processDue(shopId, customerId, actor.sub);
    }
    return {
      ...dto,
      context: {
        ...(dto.context ?? {}),
        isMember,
      },
    } as T;
  }

  async reconcileStoredValue(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const accounts = await this.prisma.storedValueAccount.findMany({
      where: { shopId },
    });
    const entries = await this.prisma.storedValueLedgerEntry.findMany({
      where: { shopId },
    });
    const policies = await this.prisma.storedValueAccountPolicy.findMany({
      where: { shopId },
    });
    const policyByAccount = new Map(
      policies.map((row) => [row.accountId, row]),
    );
    const paymentIds = [
      ...new Set(
        entries
          .map((row) => row.paymentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const payments = paymentIds.length
      ? await this.prisma.payment.findMany({
          where: { shopId, id: { in: paymentIds } },
          select: { id: true, status: true },
        })
      : [];
    const paymentStatus = new Map(
      payments.map((row) => [row.id, row.status]),
    );
    const issues: Array<Record<string, unknown>> = [];
    const balances = accounts.map((account) => {
      const accountEntries = entries.filter(
        (row) => row.accountId === account.id,
      );
      const balanceMinor = accountEntries.reduce(
        (sum, row) => sum + row.amountMinor,
        0,
      );
      if (balanceMinor < 0) {
        issues.push({
          type: 'NEGATIVE_BALANCE',
          accountId: account.id,
          balanceMinor,
        });
      }
      const policy = policyByAccount.get(account.id);
      if (balanceMinor > 0 && accountExpired(policy?.expiresAt)) {
        issues.push({
          type: 'EXPIRED_POSITIVE_LIABILITY',
          accountId: account.id,
          balanceMinor,
          expiresAt: policy?.expiresAt,
        });
      }
      for (const row of accountEntries) {
        if (
          row.type === 'LOAD' &&
          row.sourceType !== 'TRANSFER' &&
          (!row.paymentId || paymentStatus.get(row.paymentId) !== 'SUCCESS')
        ) {
          issues.push({
            type: 'UNRECONCILED_LOAD',
            accountId: account.id,
            entryId: row.id,
            paymentId: row.paymentId ?? null,
          });
        }
      }
      return {
        accountId: account.id,
        currency: account.currency,
        status: account.status,
        balanceMinor,
      };
    });
    const liabilityByCurrency = new Map<string, number>();
    for (const row of balances) {
      liabilityByCurrency.set(
        row.currency,
        (liabilityByCurrency.get(row.currency) ?? 0) + row.balanceMinor,
      );
    }
    return {
      ok: issues.length === 0,
      balances,
      liabilityByCurrency: Object.fromEntries(liabilityByCurrency),
      issues,
    };
  }
}
