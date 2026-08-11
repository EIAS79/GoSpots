import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { projectPointsBalance, projectSignedBalance, signedLedgerAmount } from './growth.rules';
import type {
  CreateCustomerDto,
  CreateStoredValueAccountDto,
  CreateTierDto,
  EnrollCustomerDto,
  LoyaltyEntryDto,
  MergeCustomerDto,
  RecordVisitDto,
  ReverseRewardsDto,
  StoredValueEntryDto,
} from './growth.types';

@Injectable()
export class GrowthCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCustomers(actor: JwtAccessPayload) {
    return this.prisma.customerProfile.findMany({
      where: { shopId: requireShopId(actor) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCustomer(actor: JwtAccessPayload, dto: CreateCustomerDto) {
    const shopId = requireShopId(actor);
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);
    if (!email && !phone) {
      throw new BadRequestException('Customer requires email or phone.');
    }

    const identity = await this.prisma.customerIdentity.findFirst({
      where: {
        shopId,
        OR: [
          ...(email ? [{ kind: 'EMAIL', normalizedValue: email }] : []),
          ...(phone ? [{ kind: 'PHONE', normalizedValue: phone }] : []),
        ],
      },
    });
    if (identity) return this.requireCustomer(shopId, identity.customerId);

    const customer = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerProfile.findFirst({
        where: {
          shopId,
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
      });
      if (existing) {
        await this.ensureIdentities(tx, shopId, existing.id, email, phone);
        return existing;
      }
      const created = await tx.customerProfile.create({
        data: {
          shopId,
          name: dto.name?.trim() || null,
          email,
          phone,
          marketingConsentAt: dto.marketingConsent ? new Date() : null,
          consentSource: dto.marketingConsent
            ? dto.consentSource?.trim() || 'STAFF'
            : null,
          notes: dto.notes?.trim() || null,
        },
      });
      await this.ensureIdentities(tx, shopId, created.id, email, phone);
      return created;
    });

    await this.record(actor, 'customer.create', 'Created customer profile', {
      customerId: customer.id,
      hasMarketingConsent: Boolean(customer.marketingConsentAt),
    });
    return customer;
  }

  async mergeCustomer(
    actor: JwtAccessPayload,
    canonicalCustomerId: string,
    dto: MergeCustomerDto,
  ) {
    const shopId = requireShopId(actor);
    if (canonicalCustomerId === dto.mergedCustomerId) {
      throw new BadRequestException('A customer cannot be merged into itself.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const ids = [canonicalCustomerId, dto.mergedCustomerId].sort();
      for (const id of ids) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-merge:${shopId}:${id}`}))`;
      }
      const canonical = await tx.customerProfile.findFirst({
        where: { id: canonicalCustomerId, shopId },
      });
      const merged = await tx.customerProfile.findFirst({
        where: { id: dto.mergedCustomerId, shopId },
      });
      if (!canonical || !merged) throw new NotFoundException('Customer record not found.');

      const identities = await tx.customerIdentity.findMany({
        where: { shopId, customerId: merged.id },
      });
      let movedIdentities = 0;
      for (const identity of identities) {
        const duplicate = await tx.customerIdentity.findFirst({
          where: {
            shopId,
            customerId: canonical.id,
            kind: identity.kind,
            normalizedValue: identity.normalizedValue,
          },
        });
        if (duplicate) {
          await tx.customerIdentity.delete({ where: { id: identity.id } });
        } else {
          await tx.customerIdentity.update({
            where: { id: identity.id },
            data: { customerId: canonical.id },
          });
          movedIdentities += 1;
        }
      }

      const loyalty = await tx.loyaltyLedgerEntry.updateMany({
        where: { shopId, customerId: merged.id },
        data: { customerId: canonical.id },
      });
      const wallets = await tx.storedValueAccount.updateMany({
        where: { shopId, customerId: merged.id },
        data: { customerId: canonical.id },
      });
      const visits = await tx.customerVisit.updateMany({
        where: { shopId, customerId: merged.id },
        data: { customerId: canonical.id },
      });
      const proofs = await tx.reviewVisitProof.updateMany({
        where: { shopId, customerId: merged.id },
        data: { customerId: canonical.id },
      });

      const canonicalMembership = await tx.customerMembership.findFirst({
        where: { shopId, customerId: canonical.id },
      });
      const mergedMembership = await tx.customerMembership.findFirst({
        where: { shopId, customerId: merged.id },
      });
      let membershipAction = 'none';
      if (mergedMembership && !canonicalMembership) {
        await tx.customerMembership.update({
          where: { id: mergedMembership.id },
          data: { customerId: canonical.id },
        });
        membershipAction = 'moved';
      } else if (mergedMembership && canonicalMembership) {
        const tiers = await tx.membershipTier.findMany({
          where: {
            shopId,
            id: { in: [canonicalMembership.tierId, mergedMembership.tierId] },
          },
        });
        const canonicalRank =
          tiers.find((tier) => tier.id === canonicalMembership.tierId)?.rank ?? 0;
        const mergedRank =
          tiers.find((tier) => tier.id === mergedMembership.tierId)?.rank ?? 0;
        if (mergedRank > canonicalRank) {
          await tx.customerMembership.update({
            where: { id: canonicalMembership.id },
            data: {
              tierId: mergedMembership.tierId,
              expiresAt: mergedMembership.expiresAt,
            },
          });
          membershipAction = 'upgraded';
        }
        await tx.customerMembership.delete({ where: { id: mergedMembership.id } });
      }

      const updated = await tx.customerProfile.update({
        where: { id: canonical.id },
        data: {
          name: canonical.name ?? merged.name,
          email: canonical.email ?? merged.email,
          phone: canonical.phone ?? merged.phone,
          marketingConsentAt:
            canonical.marketingConsentAt ?? merged.marketingConsentAt,
          consentSource: canonical.consentSource ?? merged.consentSource,
          notes: canonical.notes ?? merged.notes,
        },
      });
      await tx.customerProfile.delete({ where: { id: merged.id } });

      const referenceCounts = {
        identities: movedIdentities,
        loyaltyEntries: loyalty.count,
        storedValueAccounts: wallets.count,
        visits: visits.count,
        reviewProofs: proofs.count,
        membership: membershipAction,
      };
      const mergeAudit = await tx.customerMergeAudit.create({
        data: {
          shopId,
          canonicalCustomerId: canonical.id,
          mergedCustomerId: merged.id,
          reason: dto.reason?.trim() || null,
          referenceCounts: referenceCounts as Prisma.InputJsonValue,
          actorUserId: actor.sub,
        },
      });
      return { customer: updated, mergeAudit, referenceCounts };
    });

    await this.record(actor, 'customer.merge', 'Merged duplicate customer records', {
      canonicalCustomerId,
      mergedCustomerId: dto.mergedCustomerId,
      ...result.referenceCounts,
    });
    return result;
  }

  async createTier(actor: JwtAccessPayload, dto: CreateTierDto) {
    const shopId = requireShopId(actor);
    const tier = await this.prisma.membershipTier.create({
      data: {
        shopId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        rank: dto.rank ?? 0,
        earnRateBasisPoints: Math.max(0, dto.earnRateBasisPoints ?? 0),
        benefits: (dto.benefits ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.record(actor, 'membership.tier.create', 'Created membership tier', {
      tierId: tier.id,
      code: tier.code,
      benefits: tier.benefits,
    });
    return tier;
  }

  async enroll(
    actor: JwtAccessPayload,
    customerId: string,
    dto: EnrollCustomerDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    const tier = await this.prisma.membershipTier.findFirst({
      where: { id: dto.tierId, shopId, active: true },
    });
    if (!tier) throw new NotFoundException('Membership tier not found.');
    const membership = await this.prisma.customerMembership.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: {
        shopId,
        customerId,
        tierId: tier.id,
        expiresAt: dto.expiresAt ? this.parseDate(dto.expiresAt, 'expiresAt') : null,
      },
      update: {
        tierId: tier.id,
        status: 'ACTIVE',
        expiresAt: dto.expiresAt ? this.parseDate(dto.expiresAt, 'expiresAt') : null,
      },
    });
    await this.record(actor, 'membership.enroll', 'Enrolled customer', {
      customerId,
      tierId: tier.id,
    });
    return { membership, tier };
  }

  async loyalty(
    actor: JwtAccessPayload,
    customerId: string,
    dto: LoyaltyEntryDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    const points = this.signedPoints(dto.type, dto.points);
    const entry = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${shopId}:${customerId}`}))`;
      const existing = await tx.loyaltyLedgerEntry.findUnique({
        where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      });
      if (existing) return existing;
      const prior = await tx.loyaltyLedgerEntry.findMany({
        where: { shopId, customerId },
        select: { points: true },
      });
      if (dto.type !== 'REVERSAL' && projectPointsBalance(prior) + points < 0) {
        throw new ConflictException(
          'Loyalty redemption cannot create a negative points balance.',
        );
      }
      return tx.loyaltyLedgerEntry.create({
        data: {
          shopId,
          customerId,
          type: dto.type,
          points,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          correlationId: dto.correlationId,
          note: dto.note,
          actorUserId: actor.sub,
        },
      });
    });
    await this.record(actor, 'loyalty.ledger', 'Recorded loyalty movement', {
      customerId,
      entryId: entry.id,
      points: entry.points,
      type: entry.type,
    });
    return { entry, balance: await this.loyaltyBalance(shopId, customerId) };
  }

  async reverseRewards(
    actor: JwtAccessPayload,
    customerId: string,
    dto: ReverseRewardsDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${shopId}:${customerId}`}))`;
      const existing = await tx.loyaltyLedgerEntry.findUnique({
        where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      });
      if (existing) return { entry: existing, reversedPoints: Math.abs(existing.points) };
      const sourceRows = await tx.loyaltyLedgerEntry.findMany({
        where: {
          shopId,
          customerId,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
        },
      });
      const sourceNet = sourceRows.reduce((sum, row) => sum + row.points, 0);
      if (sourceNet <= 0) return { entry: null, reversedPoints: 0 };
      const entry = await tx.loyaltyLedgerEntry.create({
        data: {
          shopId,
          customerId,
          type: 'REVERSAL',
          points: -sourceNet,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          correlationId: dto.correlationId,
          note: dto.note ?? 'Reward reversal after refund/cancel',
          actorUserId: actor.sub,
        },
      });
      return { entry, reversedPoints: sourceNet };
    });
    await this.record(actor, 'loyalty.refund-reversal', 'Reversed eligible reward', {
      customerId,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      reversedPoints: result.reversedPoints,
    });
    return { ...result, balance: await this.loyaltyBalance(shopId, customerId) };
  }

  async createStoredAccount(
    actor: JwtAccessPayload,
    dto: CreateStoredValueAccountDto,
  ) {
    const shopId = requireShopId(actor);
    if (dto.customerId) await this.requireCustomer(shopId, dto.customerId);
    const code =
      dto.code?.trim() || randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const account = await this.prisma.storedValueAccount.create({
      data: {
        shopId,
        customerId: dto.customerId,
        codeHash: this.hashCode(code),
        currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
      },
    });
    await this.record(actor, 'stored-value.account.create', 'Created stored-value account', {
      accountId: account.id,
      customerId: account.customerId,
    });
    return { account, code };
  }

  async storedValue(
    actor: JwtAccessPayload,
    accountId: string,
    dto: StoredValueEntryDto,
  ) {
    const shopId = requireShopId(actor);
    const account = await this.prisma.storedValueAccount.findFirst({
      where: { id: accountId, shopId, status: 'ACTIVE' },
    });
    if (!account) throw new NotFoundException('Active stored-value account not found.');
    const amountMinor = signedLedgerAmount(dto.type, dto.amountMinor, ['REDEEM']);
    if (dto.paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: dto.paymentId, shopId, status: 'SUCCESS' },
      });
      if (!payment) {
        throw new ConflictException('Successful payment not found for stored-value load.');
      }
    }
    const entry = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stored-value:${shopId}:${accountId}`}))`;
      const existing = await tx.storedValueLedgerEntry.findUnique({
        where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      });
      if (existing) return existing;
      const prior = await tx.storedValueLedgerEntry.findMany({
        where: { shopId, accountId },
        select: { amountMinor: true },
      });
      if (projectSignedBalance(prior) + amountMinor < 0) {
        throw new ConflictException(
          'Stored-value redemption cannot create a negative balance.',
        );
      }
      return tx.storedValueLedgerEntry.create({
        data: {
          shopId,
          accountId,
          type: dto.type,
          amountMinor,
          currency: account.currency,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          paymentId: dto.paymentId,
          correlationId: dto.correlationId,
          note: dto.note,
          actorUserId: actor.sub,
        },
      });
    });
    await this.record(actor, 'stored-value.ledger', 'Recorded stored-value movement', {
      accountId,
      entryId: entry.id,
      amountMinor: entry.amountMinor,
    });
    return { entry, balanceMinor: await this.storedBalance(shopId, accountId) };
  }

  async recordVisit(
    actor: JwtAccessPayload,
    customerId: string,
    dto: RecordVisitDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    const evidence = await this.visitEvidence(shopId, dto);
    const proofHash = createHash('sha256')
      .update(`${shopId}:${customerId}:${dto.sourceType}:${dto.sourceId}`)
      .digest('hex');
    const visit = await this.prisma.customerVisit.upsert({
      where: {
        shopId_sourceType_sourceId: {
          shopId,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
        },
      },
      create: {
        shopId,
        customerId,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        completedAt: evidence.completedAt,
        reservationId: evidence.reservationId,
        guestCheckId: evidence.guestCheckId,
        operationsSessionId: evidence.operationsSessionId,
        eventRequestId: evidence.eventRequestId,
        settledAmountMinor: evidence.settledAmountMinor,
        currency: evidence.currency,
        proofHash,
      },
      update: {
        customerId,
        completedAt: evidence.completedAt,
        settledAmountMinor: evidence.settledAmountMinor,
        currency: evidence.currency,
      },
    });
    await this.record(actor, 'customer.visit.record', 'Recorded completed customer visit', {
      customerId,
      visitId: visit.id,
      sourceType: visit.sourceType,
    });
    return visit;
  }

  async issueReviewProof(
    actor: JwtAccessPayload,
    customerId: string,
    visitId: string,
  ) {
    const shopId = requireShopId(actor);
    const visit = await this.prisma.customerVisit.findFirst({
      where: { id: visitId, shopId, customerId },
    });
    if (!visit) throw new NotFoundException('Verified visit not found.');
    const raw = randomBytes(24).toString('base64url');
    const proof = await this.prisma.reviewVisitProof.create({
      data: {
        shopId,
        customerId,
        visitId,
        publicTokenHash: createHash('sha256').update(raw).digest('hex'),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await this.record(actor, 'customer.review-proof.issue', 'Issued verified review proof', {
      customerId,
      visitId,
      proofId: proof.id,
    });
    return { proofId: proof.id, token: raw, validUntil: proof.validUntil };
  }

  async customerHistory(actor: JwtAccessPayload, customerId: string) {
    const shopId = requireShopId(actor);
    const customer = await this.requireCustomer(shopId, customerId);
    const identities = await this.prisma.customerIdentity.findMany({
      where: { shopId, customerId },
      orderBy: { createdAt: 'asc' },
    });
    const membership = await this.prisma.customerMembership.findFirst({
      where: { shopId, customerId },
    });
    const tier = membership
      ? await this.prisma.membershipTier.findFirst({
          where: { id: membership.tierId, shopId },
        })
      : null;
    const loyalty = await this.prisma.loyaltyLedgerEntry.findMany({
      where: { shopId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    const accounts = await this.prisma.storedValueAccount.findMany({
      where: { shopId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    const storedValue = [];
    for (const account of accounts) {
      storedValue.push({
        account,
        balanceMinor: await this.storedBalance(shopId, account.id),
      });
    }
    const visits = await this.prisma.customerVisit.findMany({
      where: { shopId, customerId },
      orderBy: { completedAt: 'desc' },
      take: 200,
    });
    const mergeHistory = await this.prisma.customerMergeAudit.findMany({
      where: { shopId, canonicalCustomerId: customerId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      customer,
      identities,
      membership: membership ? { ...membership, tier } : null,
      loyaltyBalance: projectPointsBalance(loyalty),
      loyalty,
      storedValue,
      visits,
      mergeHistory,
    };
  }

  private async ensureIdentities(
    tx: Prisma.TransactionClient,
    shopId: string,
    customerId: string,
    email: string | null,
    phone: string | null,
  ) {
    const identities = [
      ...(email ? [{ kind: 'EMAIL', normalizedValue: email }] : []),
      ...(phone ? [{ kind: 'PHONE', normalizedValue: phone }] : []),
    ];
    for (const identity of identities) {
      await tx.customerIdentity.upsert({
        where: {
          shopId_kind_normalizedValue: {
            shopId,
            kind: identity.kind,
            normalizedValue: identity.normalizedValue,
          },
        },
        create: { shopId, customerId, ...identity },
        update: { customerId },
      });
    }
  }

  private async visitEvidence(shopId: string, dto: RecordVisitDto) {
    if (dto.sourceType === 'RESERVATION') {
      const row = await this.prisma.reservation.findFirst({
        where: { id: dto.sourceId, shopId },
      });
      if (!row || row.status !== 'COMPLETED') {
        throw new ConflictException('Reservation is not completed.');
      }
      return {
        completedAt: row.endsAt,
        reservationId: row.id,
        guestCheckId: row.guestCheckId,
        operationsSessionId: null,
        eventRequestId: null,
        settledAmountMinor: row.billedAmount
          ? this.decimalToMinor(row.billedAmount)
          : null,
        currency: null,
      };
    }
    if (dto.sourceType === 'GUEST_CHECK') {
      const row = await this.prisma.guestCheck.findFirst({
        where: { id: dto.sourceId, shopId },
      });
      if (!row || row.status !== 'SETTLED' || !row.settledAt) {
        throw new ConflictException('Guest check is not settled.');
      }
      return {
        completedAt: row.settledAt,
        reservationId: null,
        guestCheckId: row.id,
        operationsSessionId: null,
        eventRequestId: null,
        settledAmountMinor: await this.guestCheckRevenueMinor(shopId, row.id),
        currency: row.currency,
      };
    }
    if (dto.sourceType === 'OPERATIONS_SESSION') {
      const row = await this.prisma.operationsSession.findFirst({
        where: { id: dto.sourceId, shopId },
      });
      if (!row || !row.finishedAt) {
        throw new ConflictException('Operations session is not finished.');
      }
      return {
        completedAt: row.finishedAt,
        reservationId: row.reservationId,
        guestCheckId: row.guestCheckId,
        operationsSessionId: row.id,
        eventRequestId: null,
        settledAmountMinor: row.accruedMinor,
        currency: row.currency,
      };
    }
    const execution = await this.prisma.eventExecution.findFirst({
      where: { shopId, eventRequestId: dto.sourceId, status: 'COMPLETED' },
    });
    if (!execution?.completedAt) throw new ConflictException('Event is not completed.');
    const check = execution.guestCheckId
      ? await this.prisma.guestCheck.findFirst({
          where: { id: execution.guestCheckId, shopId, status: 'SETTLED' },
        })
      : null;
    return {
      completedAt: execution.completedAt,
      reservationId: null,
      guestCheckId: check?.id ?? null,
      operationsSessionId: null,
      eventRequestId: dto.sourceId,
      settledAmountMinor: check
        ? await this.guestCheckRevenueMinor(shopId, check.id)
        : null,
      currency: check?.currency ?? null,
    };
  }

  private async guestCheckRevenueMinor(shopId: string, guestCheckId: string) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { shopId, guestCheckId },
    });
    let total = 0;
    for (const row of rows) {
      const minor = Math.abs(this.decimalToMinor(row.amount));
      if (row.kind === 'SALE') total += minor;
      if (row.kind === 'REFUND') total -= minor;
    }
    return total;
  }

  private signedPoints(type: string, points: number) {
    if (!Number.isInteger(points) || points === 0) {
      throw new BadRequestException('Points must be a non-zero integer.');
    }
    if (type === 'ADJUST' || type === 'REVERSAL') return points;
    return type === 'REDEEM' || type === 'EXPIRE'
      ? -Math.abs(points)
      : Math.abs(points);
  }

  private async loyaltyBalance(shopId: string, customerId: string) {
    const rows = await this.prisma.loyaltyLedgerEntry.findMany({
      where: { shopId, customerId },
      select: { points: true },
    });
    return projectPointsBalance(rows);
  }

  private async storedBalance(shopId: string, accountId: string) {
    const rows = await this.prisma.storedValueLedgerEntry.findMany({
      where: { shopId, accountId },
      select: { amountMinor: true },
    });
    return projectSignedBalance(rows);
  }

  private normalizeEmail(value?: string) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }

  private normalizePhone(value?: string) {
    const normalized = value?.trim().replace(/[\s().-]/g, '');
    return normalized || null;
  }

  private hashCode(code: string) {
    return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
  }

  private async requireCustomer(shopId: string, id: string) {
    const row = await this.prisma.customerProfile.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new NotFoundException('Customer not found.');
    return row;
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date/time.`);
    }
    return date;
  }

  private decimalToMinor(value: { toString(): string }) {
    return Math.round(Number(value.toString()) * 100);
  }

  private record(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    return this.audit.record(actor, { section: 'reservation', action, summary, meta });
  }
}
