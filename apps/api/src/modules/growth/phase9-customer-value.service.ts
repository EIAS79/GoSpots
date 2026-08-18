import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { hasPermission, PERMISSIONS, type PermissionKey } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GrowthPricingService } from './growth-pricing.service';
import type {
  LoyaltyEntryDto,
  QuoteDto,
  ReverseRewardsDto,
  SnapshotDto,
  StoredValueEntryDto,
} from './growth.types';
import {
  accountExpired,
  effectiveMembershipState,
  promotionDomain,
  promotionUsageEligible,
  signedBenefitUnits,
  signedLoyaltyPoints,
  signedStoredValueAmount,
} from './phase9.rules';

type PricingQuoteResult = Awaited<ReturnType<GrowthPricingService['quote']>>;

type PackageMutationDto = {
  type: 'LOAD' | 'CONSUME' | 'REFUND' | 'REVERSAL' | 'ADJUST';
  units: number;
  sourceType?: string;
  sourceId?: string;
  paymentId?: string;
  correlationId: string;
  note?: string;
};

type MembershipUsageDto = {
  type: 'GRANT' | 'CONSUME' | 'REFUND' | 'REVERSAL' | 'ADJUST';
  benefitKey: string;
  unitKind: string;
  units: number;
  sourceType?: string;
  sourceId?: string;
  correlationId: string;
  note?: string;
};

@Injectable()
export class Phase9CustomerValueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: GrowthPricingService,
  ) {}

  async createAnonymousCustomer(
    actor: JwtAccessPayload,
    dto: { name?: string; notes?: string },
  ) {
    const shopId = requireShopId(actor);
    const customer = await this.prisma.customerProfile.create({
      data: {
        shopId,
        name: dto.name?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'customer.anonymous.create',
      summary: 'Created anonymous customer profile',
      meta: { customerId: customer.id },
    });
    return customer;
  }

  async setMarketingConsent(
    actor: JwtAccessPayload,
    customerId: string,
    dto: { granted: boolean; source?: string },
  ) {
    const shopId = requireShopId(actor);
    const source = dto.source?.trim() || 'STAFF';
    const existing = await this.requireCustomer(shopId, customerId);
    const occurredAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customerProfile.update({
        where: { id: existing.id },
        data: {
          marketingConsentAt: dto.granted ? occurredAt : null,
          consentSource: source,
        },
      });
      const event = await tx.customerConsentEvent.create({
        data: {
          shopId,
          customerId,
          purpose: 'MARKETING',
          state: dto.granted ? 'GRANTED' : 'REVOKED',
          source,
          occurredAt,
          actorUserId: actor.sub,
        },
      });
      return { customer, event };
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: dto.granted ? 'customer.consent.grant' : 'customer.consent.revoke',
      summary: dto.granted ? 'Granted customer marketing consent' : 'Revoked customer marketing consent',
      previousState: {
        marketingConsentAt: existing.marketingConsentAt?.toISOString() ?? null,
        consentSource: existing.consentSource,
      },
      newState: {
        marketingConsentAt: result.customer.marketingConsentAt?.toISOString() ?? null,
        consentSource: result.customer.consentSource,
      },
      meta: { customerId, consentEventId: result.event.id },
    });
    return result;
  }

  async ensureConsentProvenance(actor: JwtAccessPayload, customerId: string) {
    const shopId = requireShopId(actor);
    const customer = await this.requireCustomer(shopId, customerId);
    if (!customer.marketingConsentAt) return null;
    const existing = await this.prisma.customerConsentEvent.findFirst({
      where: { shopId, customerId, purpose: 'MARKETING', state: 'GRANTED' },
      orderBy: { occurredAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.customerConsentEvent.create({
      data: {
        shopId,
        customerId,
        purpose: 'MARKETING',
        state: 'GRANTED',
        source: customer.consentSource ?? 'LEGACY_MIGRATION',
        occurredAt: customer.marketingConsentAt,
        actorUserId: actor.sub,
      },
    });
  }

  async setPreference(
    actor: JwtAccessPayload,
    customerId: string,
    key: string,
    value: Prisma.InputJsonValue,
  ) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || normalizedKey.length > 80) {
      throw new BadRequestException('Preference key is required and must be at most 80 characters.');
    }
    const preference = await this.prisma.customerPreference.upsert({
      where: { shopId_customerId_key: { shopId, customerId, key: normalizedKey } },
      create: {
        shopId,
        customerId,
        key: normalizedKey,
        value,
        updatedById: actor.sub,
      },
      update: {
        value,
        version: { increment: 1 },
        updatedById: actor.sub,
      },
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'customer.preference.set',
      summary: 'Updated customer preference',
      meta: { customerId, key: normalizedKey, version: preference.version },
    });
    return preference;
  }

  async setLoyaltyPolicy(
    actor: JwtAccessPayload,
    dto: { pointsExpireDays?: number | null; startsAt?: string; endsAt?: string },
  ) {
    const shopId = requireShopId(actor);
    if (
      dto.pointsExpireDays != null &&
      (!Number.isSafeInteger(dto.pointsExpireDays) || dto.pointsExpireDays <= 0)
    ) {
      throw new BadRequestException('pointsExpireDays must be a positive integer.');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      throw new BadRequestException('Invalid loyalty policy date.');
    }
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('Loyalty policy end must be after start.');
    }
    const policy = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty-policy:${shopId}`}))`;
      const latest = await tx.loyaltyProgramPolicy.findFirst({
        where: { shopId },
        orderBy: { programVersion: 'desc' },
      });
      await tx.loyaltyProgramPolicy.updateMany({ where: { shopId, active: true }, data: { active: false } });
      return tx.loyaltyProgramPolicy.create({
        data: {
          shopId,
          programVersion: (latest?.programVersion ?? 0) + 1,
          pointsExpireDays: dto.pointsExpireDays ?? null,
          active: true,
          startsAt,
          endsAt,
        },
      });
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'loyalty.policy.change',
      summary: 'Changed loyalty program policy',
      meta: { programVersion: policy.programVersion, pointsExpireDays: policy.pointsExpireDays },
    });
    return policy;
  }

  async loyalty(actor: JwtAccessPayload, customerId: string, dto: LoyaltyEntryDto) {
    const shopId = requireShopId(actor);
    if (dto.type === 'ADJUST') this.assertHighRisk(actor, PERMISSIONS.MEMBERSHIP_BALANCE_CORRECTION);
    const requestHash = hashIdempotencyRequest({ customerId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.loyalty.mutate',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        await this.requireCustomer(shopId, customerId);
        const points = this.wrapRuleError(() => signedLoyaltyPoints(dto.type, dto.points));
        const now = new Date();
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${shopId}:${customerId}`}))`;
          const prior = await tx.loyaltyLedgerEntry.findMany({
            where: { shopId, customerId },
            select: { points: true },
          });
          const balance = prior.reduce((sum, row) => sum + row.points, 0);
          if (dto.type !== 'REVERSAL' && balance + points < 0) {
            throw new ConflictException('Loyalty redemption cannot create a negative points balance.');
          }
          const policy = await tx.loyaltyProgramPolicy.findFirst({
            where: {
              shopId,
              active: true,
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
            orderBy: { programVersion: 'desc' },
          });
          const entry = await tx.loyaltyLedgerEntry.create({
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
          const expiresAt =
            dto.type === 'EARN' && policy?.pointsExpireDays
              ? new Date(now.getTime() + policy.pointsExpireDays * 86_400_000)
              : null;
          await tx.loyaltyEntryPolicyEvidence.create({
            data: {
              shopId,
              ledgerEntryId: entry.id,
              correlationId: dto.correlationId,
              requestHash,
              programVersion: policy?.programVersion ?? 1,
              expiresAt,
            },
          });
          return { entry, balance: balance + points, programVersion: policy?.programVersion ?? 1, expiresAt };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'loyalty.ledger',
          summary: 'Recorded loyalty ledger movement',
          correlationId: dto.correlationId,
          meta: { customerId, entryId: result.entry.id, points: result.entry.points, type: result.entry.type },
        });
        return result;
      },
    );
  }

  async reverseRewards(actor: JwtAccessPayload, customerId: string, dto: ReverseRewardsDto) {
    const shopId = requireShopId(actor);
    const requestHash = hashIdempotencyRequest({ customerId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.loyalty.refund-reversal',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        await this.requireCustomer(shopId, customerId);
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${shopId}:${customerId}`}))`;
          const sourceRows = await tx.loyaltyLedgerEntry.findMany({
            where: { shopId, customerId, sourceType: dto.sourceType, sourceId: dto.sourceId },
          });
          const sourceNet = sourceRows.reduce((sum, row) => sum + row.points, 0);
          if (sourceNet <= 0) {
            return { entry: null, reversedPoints: 0, balance: await this.loyaltyBalanceTx(tx, shopId, customerId) };
          }
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
          await tx.loyaltyEntryPolicyEvidence.create({
            data: {
              shopId,
              ledgerEntryId: entry.id,
              correlationId: dto.correlationId,
              requestHash,
              programVersion: 1,
            },
          });
          return {
            entry,
            reversedPoints: sourceNet,
            balance: await this.loyaltyBalanceTx(tx, shopId, customerId),
          };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'loyalty.refund-reversal',
          summary: 'Reversed loyalty benefit after refund/cancel',
          correlationId: dto.correlationId,
          meta: { customerId, sourceType: dto.sourceType, sourceId: dto.sourceId, reversedPoints: result.reversedPoints },
        });
        return result;
      },
    );
  }

  async configureStoredValuePolicy(
    actor: JwtAccessPayload,
    accountId: string,
    dto: { transferAllowed?: boolean; refundAllowed?: boolean; expiresAt?: string | null; legalPolicyRef?: string | null },
  ) {
    const shopId = requireShopId(actor);
    await this.requireStoredAccount(shopId, accountId);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new BadRequestException('Invalid expiry date.');
    const policy = await this.prisma.storedValueAccountPolicy.upsert({
      where: { accountId },
      create: {
        shopId,
        accountId,
        transferAllowed: dto.transferAllowed ?? false,
        refundAllowed: dto.refundAllowed ?? true,
        expiresAt,
        legalPolicyRef: dto.legalPolicyRef?.trim() || null,
      },
      update: {
        transferAllowed: dto.transferAllowed,
        refundAllowed: dto.refundAllowed,
        expiresAt,
        legalPolicyRef: dto.legalPolicyRef?.trim() || null,
      },
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'stored-value.policy.change',
      summary: 'Changed stored-value policy',
      meta: { accountId, transferAllowed: policy.transferAllowed, refundAllowed: policy.refundAllowed, expiresAt: policy.expiresAt?.toISOString() ?? null },
    });
    return policy;
  }

  async storedValue(actor: JwtAccessPayload, accountId: string, dto: StoredValueEntryDto) {
    const shopId = requireShopId(actor);
    if (dto.type === 'ADJUST') this.assertHighRisk(actor, PERMISSIONS.MEMBERSHIP_BALANCE_CORRECTION);
    if (dto.type === 'REFUND') this.assertHighRisk(actor, PERMISSIONS.REFUND_EXECUTE);
    const requestHash = hashIdempotencyRequest({ accountId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.stored-value.mutate',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        const account = await this.requireStoredAccount(shopId, accountId);
        const policy = await this.prisma.storedValueAccountPolicy.findUnique({ where: { accountId } });
        if (accountExpired(policy?.expiresAt) && !['REFUND', 'REVERSAL'].includes(dto.type)) {
          throw new ConflictException('Stored-value account has expired.');
        }
        if (dto.type === 'REFUND' && policy?.refundAllowed === false) {
          throw new ConflictException('Stored-value refunds are disabled by policy.');
        }
        if (dto.type === 'LOAD' && !dto.paymentId) {
          throw new ConflictException('Stored-value load requires a successful canonical payment.');
        }
        if (dto.paymentId) await this.requireSuccessfulPayment(shopId, dto.paymentId);
        const amountMinor = this.wrapRuleError(() => signedStoredValueAmount(dto.type, dto.amountMinor));
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stored-value:${shopId}:${accountId}`}))`;
          const balance = await this.storedBalanceTx(tx, shopId, accountId);
          if (balance + amountMinor < 0) {
            throw new ConflictException('Stored-value redemption cannot create a negative balance.');
          }
          const entry = await tx.storedValueLedgerEntry.create({
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
          return { entry, balanceMinor: balance + amountMinor };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'stored-value.ledger',
          summary: 'Recorded stored-value ledger movement',
          correlationId: dto.correlationId,
          meta: { accountId, entryId: result.entry.id, amountMinor: result.entry.amountMinor, type: result.entry.type },
        });
        return result;
      },
    );
  }

  async transferStoredValue(
    actor: JwtAccessPayload,
    sourceAccountId: string,
    dto: { destinationAccountId: string; amountMinor: number; correlationId: string; note?: string },
  ) {
    const shopId = requireShopId(actor);
    const requestHash = hashIdempotencyRequest({ sourceAccountId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.stored-value.transfer',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        if (sourceAccountId === dto.destinationAccountId) {
          throw new BadRequestException('Source and destination stored-value accounts must differ.');
        }
        const amountMinor = this.wrapRuleError(() => signedStoredValueAmount('LOAD', dto.amountMinor));
        const result = await this.prisma.$transaction(async (tx) => {
          for (const id of [sourceAccountId, dto.destinationAccountId].sort()) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stored-value:${shopId}:${id}`}))`;
          }
          const [source, destination] = await Promise.all([
            tx.storedValueAccount.findFirst({ where: { id: sourceAccountId, shopId, status: 'ACTIVE' } }),
            tx.storedValueAccount.findFirst({ where: { id: dto.destinationAccountId, shopId, status: 'ACTIVE' } }),
          ]);
          if (!source || !destination) throw new NotFoundException('Active stored-value account not found.');
          if (source.currency !== destination.currency) throw new ConflictException('Stored-value transfer currency mismatch.');
          const sourcePolicy = await tx.storedValueAccountPolicy.findUnique({ where: { accountId: source.id } });
          const destinationPolicy = await tx.storedValueAccountPolicy.findUnique({ where: { accountId: destination.id } });
          if (!sourcePolicy?.transferAllowed) throw new ForbiddenException('Stored-value transfer is disabled by policy.');
          if (accountExpired(sourcePolicy.expiresAt) || accountExpired(destinationPolicy?.expiresAt)) {
            throw new ConflictException('Expired stored-value account cannot participate in a transfer.');
          }
          const sourceBalance = await this.storedBalanceTx(tx, shopId, source.id);
          if (sourceBalance < amountMinor) throw new ConflictException('Insufficient stored-value balance.');
          const destinationBalance = await this.storedBalanceTx(tx, shopId, destination.id);
          const [debit, credit] = await Promise.all([
            tx.storedValueLedgerEntry.create({
              data: {
                shopId,
                accountId: source.id,
                type: 'REDEEM',
                amountMinor: -amountMinor,
                currency: source.currency,
                sourceType: 'TRANSFER',
                sourceId: dto.destinationAccountId,
                correlationId: `${dto.correlationId}:OUT`,
                note: dto.note,
                actorUserId: actor.sub,
              },
            }),
            tx.storedValueLedgerEntry.create({
              data: {
                shopId,
                accountId: destination.id,
                type: 'LOAD',
                amountMinor,
                currency: destination.currency,
                sourceType: 'TRANSFER',
                sourceId: sourceAccountId,
                correlationId: `${dto.correlationId}:IN`,
                note: dto.note,
                actorUserId: actor.sub,
              },
            }),
          ]);
          return {
            debit,
            credit,
            sourceBalanceMinor: sourceBalance - amountMinor,
            destinationBalanceMinor: destinationBalance + amountMinor,
          };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'stored-value.transfer',
          summary: 'Transferred stored value between customer accounts',
          correlationId: dto.correlationId,
          meta: { sourceAccountId, destinationAccountId: dto.destinationAccountId, amountMinor },
        });
        return result;
      },
    );
  }

  async reconcileStoredValue(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const accounts = await this.prisma.storedValueAccount.findMany({ where: { shopId } });
    const entries = await this.prisma.storedValueLedgerEntry.findMany({ where: { shopId } });
    const policies = await this.prisma.storedValueAccountPolicy.findMany({ where: { shopId } });
    const policyByAccount = new Map(policies.map((row) => [row.accountId, row]));
    const paymentIds = [...new Set(entries.map((row) => row.paymentId).filter((id): id is string => Boolean(id)))];
    const payments = paymentIds.length
      ? await this.prisma.payment.findMany({ where: { shopId, id: { in: paymentIds } }, select: { id: true, status: true } })
      : [];
    const paymentStatus = new Map(payments.map((row) => [row.id, row.status]));
    const issues: Array<Record<string, unknown>> = [];
    const balances = accounts.map((account) => {
      const accountEntries = entries.filter((row) => row.accountId === account.id);
      const balanceMinor = accountEntries.reduce((sum, row) => sum + row.amountMinor, 0);
      if (balanceMinor < 0) issues.push({ type: 'NEGATIVE_BALANCE', accountId: account.id, balanceMinor });
      const policy = policyByAccount.get(account.id);
      if (balanceMinor > 0 && accountExpired(policy?.expiresAt)) {
        issues.push({ type: 'EXPIRED_POSITIVE_LIABILITY', accountId: account.id, balanceMinor, expiresAt: policy?.expiresAt });
      }
      for (const row of accountEntries) {
        if (row.type === 'LOAD' && (!row.paymentId || paymentStatus.get(row.paymentId) !== 'SUCCESS')) {
          issues.push({ type: 'UNRECONCILED_LOAD', accountId: account.id, entryId: row.id, paymentId: row.paymentId ?? null });
        }
      }
      return { accountId: account.id, currency: account.currency, status: account.status, balanceMinor };
    });
    return { ok: issues.length === 0, balances, issues };
  }

  async createPackageAccount(
    actor: JwtAccessPayload,
    dto: {
      customerId: string;
      packageDefinitionId: string;
      unitKind: string;
      initialUnits: number;
      paymentId: string;
      expiresAt?: string;
      correlationId: string;
    },
  ) {
    const shopId = requireShopId(actor);
    const requestHash = hashIdempotencyRequest(dto);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.package.purchase',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        await this.requireCustomer(shopId, dto.customerId);
        const definition = await this.prisma.packageDefinition.findFirst({
          where: { id: dto.packageDefinitionId, shopId, active: true },
        });
        if (!definition) throw new NotFoundException('Active package definition not found.');
        await this.requireSuccessfulPayment(shopId, dto.paymentId);
        const initialUnits = this.wrapRuleError(() => signedBenefitUnits('LOAD', dto.initialUnits));
        const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
        if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
          throw new BadRequestException('Package expiry must be a valid future date.');
        }
        const result = await this.prisma.$transaction(async (tx) => {
          const account = await tx.customerPackageAccount.create({
            data: {
              shopId,
              customerId: dto.customerId,
              packageDefinitionId: definition.id,
              unitKind: dto.unitKind.trim().toUpperCase(),
              expiresAt,
            },
          });
          const entry = await tx.customerPackageLedgerEntry.create({
            data: {
              shopId,
              accountId: account.id,
              customerId: dto.customerId,
              type: 'LOAD',
              units: initialUnits,
              sourceType: 'PACKAGE_PURCHASE',
              sourceId: definition.id,
              paymentId: dto.paymentId,
              correlationId: dto.correlationId,
              requestHash,
              actorUserId: actor.sub,
            },
          });
          return { account, entry, balanceUnits: initialUnits };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'package.purchase',
          summary: 'Loaded prepaid package benefit',
          correlationId: dto.correlationId,
          meta: { accountId: result.account.id, customerId: dto.customerId, packageDefinitionId: definition.id, units: initialUnits },
        });
        return result;
      },
    );
  }

  async packageMutation(actor: JwtAccessPayload, accountId: string, dto: PackageMutationDto) {
    const shopId = requireShopId(actor);
    if (dto.type === 'ADJUST') this.assertHighRisk(actor, PERMISSIONS.MEMBERSHIP_BALANCE_CORRECTION);
    const requestHash = hashIdempotencyRequest({ accountId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.package.mutate',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`package:${shopId}:${accountId}`}))`;
          const account = await tx.customerPackageAccount.findFirst({ where: { id: accountId, shopId } });
          if (!account) throw new NotFoundException('Customer package account not found.');
          if (account.status !== 'ACTIVE' || accountExpired(account.expiresAt)) {
            throw new ConflictException('Customer package is not active.');
          }
          if (dto.type === 'LOAD') {
            if (!dto.paymentId) throw new ConflictException('Package load requires a successful canonical payment.');
            await this.requireSuccessfulPaymentTx(tx, shopId, dto.paymentId);
          }
          const delta = this.wrapRuleError(() => signedBenefitUnits(dto.type, dto.units));
          const balance = await this.packageBalanceTx(tx, shopId, accountId);
          if (balance + delta < 0) throw new ConflictException('Package redemption cannot create a negative balance.');
          const entry = await tx.customerPackageLedgerEntry.create({
            data: {
              shopId,
              accountId,
              customerId: account.customerId,
              type: dto.type,
              units: delta,
              sourceType: dto.sourceType,
              sourceId: dto.sourceId,
              paymentId: dto.paymentId,
              correlationId: dto.correlationId,
              requestHash,
              note: dto.note,
              actorUserId: actor.sub,
            },
          });
          const nextBalance = balance + delta;
          if (dto.type === 'CONSUME' && nextBalance === 0) {
            await tx.customerPackageAccount.update({ where: { id: accountId }, data: { status: 'DEPLETED' } });
          }
          return { entry, balanceUnits: nextBalance };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'package.ledger',
          summary: 'Recorded prepaid package movement',
          correlationId: dto.correlationId,
          meta: { accountId, type: dto.type, units: result.entry.units },
        });
        return result;
      },
    );
  }

  async recordMembershipEnrollment(actor: JwtAccessPayload, customerId: string) {
    const shopId = requireShopId(actor);
    const membership = await this.prisma.customerMembership.findFirst({ where: { shopId, customerId } });
    if (!membership) return null;
    const correlationId = `membership-enroll:${membership.id}`;
    const requestHash = hashIdempotencyRequest({ membershipId: membership.id, customerId, tierId: membership.tierId, expiresAt: membership.expiresAt });
    const lifecycle = await this.prisma.membershipLifecycleEvent.upsert({
      where: { shopId_correlationId: { shopId, correlationId } },
      create: {
        shopId,
        customerId,
        membershipId: membership.id,
        eventType: 'ENROLLED',
        previousStatus: null,
        newStatus: membership.status,
        effectiveAt: membership.joinedAt,
        expiresAt: membership.expiresAt,
        correlationId,
        requestHash,
        actorUserId: actor.sub,
      },
      update: {},
    });
    await this.grantTierIncludedBenefits(actor, membership.id, customerId, membership.tierId);
    return lifecycle;
  }

  async renewMembership(
    actor: JwtAccessPayload,
    customerId: string,
    dto: { expiresAt: string; correlationId: string; reason?: string },
  ) {
    const shopId = requireShopId(actor);
    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new BadRequestException('Membership expiry must be a valid future date.');
    }
    const requestHash = hashIdempotencyRequest({ customerId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.membership.renew',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership:${shopId}:${customerId}`}))`;
          const membership = await tx.customerMembership.findFirst({ where: { shopId, customerId } });
          if (!membership) throw new NotFoundException('Customer membership not found.');
          const previousStatus = effectiveMembershipState(membership.status, membership.expiresAt);
          const updated = await tx.customerMembership.update({
            where: { id: membership.id },
            data: { status: 'ACTIVE', expiresAt },
          });
          const event = await tx.membershipLifecycleEvent.create({
            data: {
              shopId,
              customerId,
              membershipId: membership.id,
              eventType: 'RENEWED',
              previousStatus,
              newStatus: 'ACTIVE',
              effectiveAt: new Date(),
              expiresAt,
              correlationId: dto.correlationId,
              requestHash,
              reason: dto.reason,
              actorUserId: actor.sub,
            },
          });
          return { membership: updated, event };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'membership.renew',
          summary: 'Renewed customer membership',
          correlationId: dto.correlationId,
          reason: dto.reason,
          meta: { customerId, membershipId: result.membership.id, expiresAt: result.membership.expiresAt?.toISOString() },
        });
        return result;
      },
    );
  }

  async membershipUsage(actor: JwtAccessPayload, customerId: string, dto: MembershipUsageDto) {
    const shopId = requireShopId(actor);
    if (dto.type === 'ADJUST') this.assertHighRisk(actor, PERMISSIONS.MEMBERSHIP_BALANCE_CORRECTION);
    const requestHash = hashIdempotencyRequest({ customerId, ...dto });
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'phase9.membership-benefit.mutate',
        key: dto.correlationId,
        requestHash,
        correlationId: dto.correlationId,
        requireKey: true,
      },
      async () => {
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership:${shopId}:${customerId}`}))`;
          const membership = await tx.customerMembership.findFirst({ where: { shopId, customerId } });
          if (!membership) throw new NotFoundException('Customer membership not found.');
          const state = effectiveMembershipState(membership.status, membership.expiresAt);
          if (dto.type === 'CONSUME' && state !== 'ACTIVE') {
            throw new ConflictException(`Membership is ${state.toLowerCase()} and cannot consume benefits.`);
          }
          const delta = this.wrapRuleError(() => signedBenefitUnits(dto.type, dto.units));
          const balance = await this.membershipBenefitBalanceTx(tx, shopId, membership.id, dto.benefitKey);
          if (balance + delta < 0) throw new ConflictException('Membership benefit consumption cannot create a negative balance.');
          const entry = await tx.membershipUsageLedgerEntry.create({
            data: {
              shopId,
              customerId,
              membershipId: membership.id,
              benefitKey: dto.benefitKey.trim(),
              unitKind: dto.unitKind.trim().toUpperCase(),
              type: dto.type,
              units: delta,
              sourceType: dto.sourceType,
              sourceId: dto.sourceId,
              correlationId: dto.correlationId,
              requestHash,
              note: dto.note,
              actorUserId: actor.sub,
            },
          });
          return { entry, balanceUnits: balance + delta, membershipState: state };
        });
        await this.audit.record(actor, {
          section: 'customer',
          action: 'membership.benefit.ledger',
          summary: 'Recorded membership benefit movement',
          correlationId: dto.correlationId,
          meta: { customerId, benefitKey: dto.benefitKey, type: dto.type, units: result.entry.units },
        });
        return result;
      },
    );
  }

  async setPromotionUsagePolicy(
    actor: JwtAccessPayload,
    promotionId: string,
    dto: { firstVisitOnly?: boolean; minQuantity?: number | null; maxQuantity?: number | null; totalLimit?: number | null; perCustomerLimit?: number | null },
  ) {
    const shopId = requireShopId(actor);
    const promotion = await this.prisma.promotionRule.findFirst({ where: { id: promotionId, shopId } });
    if (!promotion) throw new NotFoundException('Promotion not found.');
    const conditions = await this.prisma.ruleCondition.findMany({ where: { shopId, promotionId } });
    let domain: 'GENERAL' | 'PRODUCT' | 'RESOURCE';
    try {
      domain = promotionDomain(conditions.map((row) => row.kind));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid promotion domain.');
    }
    const usesLimitedValue = Boolean(dto.firstVisitOnly || dto.totalLimit || dto.perCustomerLimit || dto.minQuantity != null || dto.maxQuantity != null);
    if (usesLimitedValue && !promotion.requiresCode) {
      throw new BadRequestException('Usage-limited promotions must require an explicit promotion code/selection.');
    }
    this.validatePromotionUsagePolicy(dto);
    const policy = await this.prisma.promotionUsagePolicy.upsert({
      where: { promotionId },
      create: { shopId, promotionId, domain, ...dto },
      update: { domain, ...dto },
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'promotion.usage-policy.change',
      summary: 'Changed promotion usage policy',
      meta: { promotionId, domain, firstVisitOnly: policy.firstVisitOnly, totalLimit: policy.totalLimit, perCustomerLimit: policy.perCustomerLimit },
    });
    return policy;
  }

  async assertPromotionPolicies(actor: JwtAccessPayload, dto: QuoteDto, quote: PricingQuoteResult) {
    const shopId = requireShopId(actor);
    const applied = quote.appliedPromotions ?? [];
    for (const row of applied) {
      const policy = await this.prisma.promotionUsagePolicy.findFirst({ where: { shopId, promotionId: row.id } });
      if (!policy) continue;
      const decision = await this.promotionDecision(this.prisma, shopId, row.id, dto.context?.customerId, dto.context?.itemIds?.length ?? 1, policy);
      if (!decision.eligible) {
        throw new ConflictException(`Promotion ${row.id} is not eligible: ${decision.reason}.`);
      }
    }
    return quote;
  }

  async snapshotWithUsagePolicies(actor: JwtAccessPayload, dto: SnapshotDto) {
    const shopId = requireShopId(actor);
    if (!dto.sourceType?.trim() || !dto.sourceId?.trim()) {
      throw new BadRequestException('sourceType and sourceId are required.');
    }
    const quote = await this.pricing.quote(actor, dto);
    await this.assertPromotionPolicies(actor, dto, quote);
    const sourceType = dto.sourceType.trim().toUpperCase();
    const sourceId = dto.sourceId.trim();
    const rules = {
      schemaVersion: 3,
      evaluationInput: quote.evaluationInput,
      evaluatedPromotions: quote.evaluatedPromotions,
      appliedPromotions: quote.appliedPromotions,
      explanations: quote.explanations,
      packages: quote.packages,
      packageMinor: quote.packageMinor,
      packageCostMinor: quote.packageCostMinor,
      contributionBeforeOtherCostsMinor: quote.contributionBeforeOtherCostsMinor,
      phase9UsagePolicy: true,
    };
    const pricingHash = createHash('sha256')
      .update(JSON.stringify({ sourceType, sourceId, subtotalMinor: quote.subtotalMinor, discountMinor: quote.discountMinor, taxMinor: quote.taxMinor, tipMinor: quote.tipMinor, totalMinor: quote.totalMinor, rules }))
      .digest('hex');
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { currency: true } });
    const currency = (dto.currency ?? quote.currency ?? shop?.currency ?? 'EUR').toUpperCase();
    const requestHash = hashIdempotencyRequest(dto);
    const result = await this.prisma.$transaction(async (tx) => {
      for (const applied of [...quote.appliedPromotions].sort((a, b) => a.id.localeCompare(b.id))) {
        const policy = await tx.promotionUsagePolicy.findFirst({ where: { shopId, promotionId: applied.id } });
        if (!policy) continue;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion-usage:${shopId}:${applied.id}`}))`;
        const decision = await this.promotionDecision(tx, shopId, applied.id, dto.context?.customerId, dto.context?.itemIds?.length ?? 1, policy);
        if (!decision.eligible) throw new ConflictException(`Promotion ${applied.id} is not eligible: ${decision.reason}.`);
      }
      const snapshot = await tx.pricingSnapshot.upsert({
        where: { shopId_sourceType_sourceId_pricingHash: { shopId, sourceType, sourceId, pricingHash } },
        create: {
          shopId,
          sourceType,
          sourceId,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          tipMinor: quote.tipMinor,
          totalMinor: quote.totalMinor,
          currency,
          rules: rules as Prisma.InputJsonValue,
          pricingHash,
          createdById: actor.sub,
        },
        update: {},
      });
      for (const applied of quote.appliedPromotions) {
        const correlationId = createHash('sha256')
          .update(`${snapshot.id}:${applied.id}:${applied.benefitKind}:${applied.discountMinor}`)
          .digest('hex');
        await tx.ruleApplication.upsert({
          where: { shopId_correlationId: { shopId, correlationId } },
          create: {
            shopId,
            promotionId: applied.id,
            sourceType,
            sourceId,
            pricingSnapshotId: snapshot.id,
            benefitKind: applied.benefitKind,
            discountMinor: applied.discountMinor,
            explanation: applied.explanation,
            conditionSnapshot: applied.conditionSnapshot as Prisma.InputJsonValue,
            benefitSnapshot: applied.benefitSnapshot as Prisma.InputJsonValue,
            correlationId,
          },
          update: {},
        });
        const policy = await tx.promotionUsagePolicy.findFirst({ where: { shopId, promotionId: applied.id } });
        if (policy) {
          await tx.promotionRedemption.upsert({
            where: { shopId_promotionId_sourceType_sourceId: { shopId, promotionId: applied.id, sourceType, sourceId } },
            create: {
              shopId,
              promotionId: applied.id,
              customerId: dto.context?.customerId,
              sourceType,
              sourceId,
              discountMinor: applied.discountMinor,
              correlationId,
              requestHash,
            },
            update: {},
          });
        }
      }
      return {
        snapshot,
        applications: await tx.ruleApplication.findMany({ where: { shopId, pricingSnapshotId: snapshot.id }, orderBy: { createdAt: 'asc' } }),
      };
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'promotion.snapshot',
      summary: 'Stored promotion snapshot with Phase 9 usage evidence',
      meta: { snapshotId: result.snapshot.id, applicationCount: result.applications.length },
    });
    return result;
  }

  async issuePortalToken(actor: JwtAccessPayload, customerId: string, ttlDays = 30) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    if (!Number.isSafeInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) {
      throw new BadRequestException('Portal token ttlDays must be between 1 and 365.');
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    const record = await this.prisma.customerPortalAccessToken.create({
      data: { shopId, customerId, tokenHash, expiresAt, createdById: actor.sub },
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'customer.portal.issue',
      summary: 'Issued customer portal access token',
      meta: { customerId, portalTokenId: record.id, expiresAt: expiresAt.toISOString() },
    });
    return { token, expiresAt, id: record.id };
  }

  async revokePortalToken(actor: JwtAccessPayload, tokenId: string) {
    const shopId = requireShopId(actor);
    const existing = await this.prisma.customerPortalAccessToken.findFirst({ where: { id: tokenId, shopId } });
    if (!existing) throw new NotFoundException('Portal token not found.');
    const record = await this.prisma.customerPortalAccessToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'customer.portal.revoke',
      summary: 'Revoked customer portal access token',
      meta: { customerId: record.customerId, portalTokenId: record.id },
    });
    return record;
  }

  async portalSnapshot(rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const access = await this.prisma.customerPortalAccessToken.findUnique({ where: { tokenHash } });
    if (!access || access.revokedAt || access.expiresAt <= new Date()) {
      throw new NotFoundException('Customer portal access is invalid or expired.');
    }
    const customer = await this.prisma.customerProfile.findFirst({ where: { id: access.customerId, shopId: access.shopId } });
    if (!customer) throw new NotFoundException('Customer not found.');
    await this.prisma.customerPortalAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
    const [membership, loyalty, packageAccounts, storedAccounts, visits, preferences, consentEvents] = await Promise.all([
      this.prisma.customerMembership.findFirst({ where: { shopId: access.shopId, customerId: customer.id } }),
      this.prisma.loyaltyLedgerEntry.findMany({ where: { shopId: access.shopId, customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.customerPackageAccount.findMany({ where: { shopId: access.shopId, customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.storedValueAccount.findMany({ where: { shopId: access.shopId, customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.customerVisit.findMany({ where: { shopId: access.shopId, customerId: customer.id }, orderBy: { completedAt: 'desc' }, take: 100 }),
      this.prisma.customerPreference.findMany({ where: { shopId: access.shopId, customerId: customer.id }, orderBy: { key: 'asc' } }),
      this.prisma.customerConsentEvent.findMany({ where: { shopId: access.shopId, customerId: customer.id }, orderBy: { occurredAt: 'desc' }, take: 100 }),
    ]);
    const packages = await Promise.all(packageAccounts.map(async (account) => ({ account, balanceUnits: await this.packageBalance(access.shopId, account.id) })));
    const storedValue = await Promise.all(storedAccounts.map(async (account) => ({ account: { id: account.id, currency: account.currency, status: account.status }, balanceMinor: await this.storedBalance(access.shopId, account.id) })));
    return {
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, marketingConsent: Boolean(customer.marketingConsentAt) },
      membership: membership ? { ...membership, effectiveStatus: effectiveMembershipState(membership.status, membership.expiresAt) } : null,
      loyalty: { balance: loyalty.reduce((sum, row) => sum + row.points, 0), entries: loyalty },
      packages,
      storedValue,
      visits,
      preferences,
      consentEvents,
    };
  }

  async finalizeCustomerMerge(actor: JwtAccessPayload, canonicalCustomerId: string, mergedCustomerId: string) {
    const shopId = requireShopId(actor);
    if (canonicalCustomerId === mergedCustomerId) return;
    await this.prisma.$transaction(async (tx) => {
      const preferences = await tx.customerPreference.findMany({ where: { shopId, customerId: mergedCustomerId } });
      for (const pref of preferences) {
        const canonical = await tx.customerPreference.findUnique({ where: { shopId_customerId_key: { shopId, customerId: canonicalCustomerId, key: pref.key } } });
        if (canonical) {
          await tx.customerPreference.delete({ where: { id: pref.id } });
        } else {
          await tx.customerPreference.update({ where: { id: pref.id }, data: { customerId: canonicalCustomerId } });
        }
      }
      await Promise.all([
        tx.customerConsentEvent.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
        tx.membershipLifecycleEvent.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
        tx.membershipUsageLedgerEntry.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
        tx.customerPackageAccount.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
        tx.customerPackageLedgerEntry.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
        tx.promotionRedemption.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
        tx.customerPortalAccessToken.updateMany({ where: { shopId, customerId: mergedCustomerId }, data: { customerId: canonicalCustomerId } }),
      ]);
    });
    await this.audit.record(actor, {
      section: 'customer',
      action: 'customer.merge.phase9-finalize',
      summary: 'Preserved Phase 9 customer value and consent history during merge',
      meta: { canonicalCustomerId, mergedCustomerId },
    });
  }

  async customerValueSummary(actor: JwtAccessPayload, customerId: string) {
    const shopId = requireShopId(actor);
    const customer = await this.requireCustomer(shopId, customerId);
    const [membership, loyalty, packages, stored, consent, preferences] = await Promise.all([
      this.prisma.customerMembership.findFirst({ where: { shopId, customerId } }),
      this.prisma.loyaltyLedgerEntry.findMany({ where: { shopId, customerId } }),
      this.prisma.customerPackageAccount.findMany({ where: { shopId, customerId } }),
      this.prisma.storedValueAccount.findMany({ where: { shopId, customerId } }),
      this.prisma.customerConsentEvent.findMany({ where: { shopId, customerId }, orderBy: { occurredAt: 'desc' } }),
      this.prisma.customerPreference.findMany({ where: { shopId, customerId }, orderBy: { key: 'asc' } }),
    ]);
    return {
      customer,
      membership: membership ? { ...membership, effectiveStatus: effectiveMembershipState(membership.status, membership.expiresAt) } : null,
      loyaltyBalance: loyalty.reduce((sum, row) => sum + row.points, 0),
      packages: await Promise.all(packages.map(async (account) => ({ account, balanceUnits: await this.packageBalance(shopId, account.id) }))),
      storedValue: await Promise.all(stored.map(async (account) => ({ account, balanceMinor: await this.storedBalance(shopId, account.id) }))),
      consent,
      preferences,
    };
  }

  private async grantTierIncludedBenefits(
    actor: JwtAccessPayload,
    membershipId: string,
    customerId: string,
    tierId: string,
  ) {
    const shopId = requireShopId(actor);
    const tier = await this.prisma.membershipTier.findFirst({ where: { id: tierId, shopId } });
    const benefits = tier?.benefits;
    if (!benefits || typeof benefits !== 'object' || Array.isArray(benefits)) return;
    const entries = Object.entries(benefits as Record<string, unknown>).filter(
      ([key, value]) => key.toLowerCase().startsWith('included') && typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    );
    for (const [benefitKey, value] of entries) {
      const correlationId = `membership-included:${membershipId}:${benefitKey}`;
      const requestHash = hashIdempotencyRequest({ membershipId, benefitKey, value });
      await this.prisma.membershipUsageLedgerEntry.upsert({
        where: { shopId_correlationId: { shopId, correlationId } },
        create: {
          shopId,
          customerId,
          membershipId,
          benefitKey,
          unitKind: benefitKey.toLowerCase().includes('hour') ? 'MINUTES' : 'COUNT',
          type: 'GRANT',
          units: benefitKey.toLowerCase().includes('hour') ? Number(value) * 60 : Number(value),
          sourceType: 'MEMBERSHIP_TIER',
          sourceId: tierId,
          correlationId,
          requestHash,
          actorUserId: actor.sub,
        },
        update: {},
      });
    }
  }

  private async promotionDecision(
    db: PrismaService | Prisma.TransactionClient,
    shopId: string,
    promotionId: string,
    customerId: string | undefined,
    quantity: number,
    policy: { firstVisitOnly: boolean; minQuantity: number | null; maxQuantity: number | null; totalLimit: number | null; perCustomerLimit: number | null },
  ) {
    const [totalRedemptions, customerRedemptions, customerVisitCount] = await Promise.all([
      db.promotionRedemption.count({ where: { shopId, promotionId } }),
      customerId ? db.promotionRedemption.count({ where: { shopId, promotionId, customerId } }) : Promise.resolve(0),
      customerId ? db.customerVisit.count({ where: { shopId, customerId } }) : Promise.resolve(0),
    ]);
    return promotionUsageEligible(policy, {
      customerVisitCount,
      quantity,
      totalRedemptions,
      customerRedemptions,
      hasCustomer: Boolean(customerId),
    });
  }

  private validatePromotionUsagePolicy(dto: { minQuantity?: number | null; maxQuantity?: number | null; totalLimit?: number | null; perCustomerLimit?: number | null }) {
    for (const [key, value] of Object.entries(dto)) {
      if (value == null || typeof value === 'boolean') continue;
      if (!Number.isSafeInteger(value) || value < 0) throw new BadRequestException(`${key} must be a non-negative integer.`);
    }
    if (dto.totalLimit === 0 || dto.perCustomerLimit === 0) throw new BadRequestException('Promotion usage limits must be positive.');
    if (dto.minQuantity != null && dto.maxQuantity != null && dto.maxQuantity < dto.minQuantity) {
      throw new BadRequestException('maxQuantity cannot be less than minQuantity.');
    }
  }

  private assertHighRisk(actor: JwtAccessPayload, permission: PermissionKey) {
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', permission)) {
      throw new ForbiddenException(`Missing ${permission} permission.`);
    }
  }

  private wrapRuleError<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid value mutation.');
    }
  }

  private async requireCustomer(shopId: string, customerId: string) {
    const customer = await this.prisma.customerProfile.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new NotFoundException('Customer not found.');
    return customer;
  }

  private async requireStoredAccount(shopId: string, accountId: string) {
    const account = await this.prisma.storedValueAccount.findFirst({ where: { id: accountId, shopId, status: 'ACTIVE' } });
    if (!account) throw new NotFoundException('Active stored-value account not found.');
    return account;
  }

  private async requireSuccessfulPayment(shopId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, shopId, status: 'SUCCESS' } });
    if (!payment) throw new ConflictException('Successful canonical payment not found.');
    return payment;
  }

  private async requireSuccessfulPaymentTx(tx: Prisma.TransactionClient, shopId: string, paymentId: string) {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, shopId, status: 'SUCCESS' } });
    if (!payment) throw new ConflictException('Successful canonical payment not found.');
    return payment;
  }

  private async loyaltyBalanceTx(tx: Prisma.TransactionClient, shopId: string, customerId: string) {
    const rows = await tx.loyaltyLedgerEntry.findMany({ where: { shopId, customerId }, select: { points: true } });
    return rows.reduce((sum, row) => sum + row.points, 0);
  }

  private async storedBalance(shopId: string, accountId: string) {
    const rows = await this.prisma.storedValueLedgerEntry.findMany({ where: { shopId, accountId }, select: { amountMinor: true } });
    return rows.reduce((sum, row) => sum + row.amountMinor, 0);
  }

  private async storedBalanceTx(tx: Prisma.TransactionClient, shopId: string, accountId: string) {
    const rows = await tx.storedValueLedgerEntry.findMany({ where: { shopId, accountId }, select: { amountMinor: true } });
    return rows.reduce((sum, row) => sum + row.amountMinor, 0);
  }

  private async packageBalance(shopId: string, accountId: string) {
    const rows = await this.prisma.customerPackageLedgerEntry.findMany({ where: { shopId, accountId }, select: { units: true } });
    return rows.reduce((sum, row) => sum + row.units, 0);
  }

  private async packageBalanceTx(tx: Prisma.TransactionClient, shopId: string, accountId: string) {
    const rows = await tx.customerPackageLedgerEntry.findMany({ where: { shopId, accountId }, select: { units: true } });
    return rows.reduce((sum, row) => sum + row.units, 0);
  }

  private async membershipBenefitBalanceTx(tx: Prisma.TransactionClient, shopId: string, membershipId: string, benefitKey: string) {
    const rows = await tx.membershipUsageLedgerEntry.findMany({ where: { shopId, membershipId, benefitKey }, select: { units: true } });
    return rows.reduce((sum, row) => sum + row.units, 0);
  }
}
