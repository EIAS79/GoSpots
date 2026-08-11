import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type PackageDefinition,
  type PromotionRule,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  computePricingQuote,
  projectPointsBalance,
  projectSignedBalance,
  signedLedgerAmount,
  type PricingContext,
  type PromotionForQuote,
  type RuleBenefitInput,
  type RuleConditionInput,
} from './growth.rules';
import type {
  CreateCustomerDto,
  CreatePackageDto,
  CreatePromotionDto,
  CreateStoredValueAccountDto,
  CreateTierDto,
  EnrollCustomerDto,
  LoyaltyEntryDto,
  MergeCustomerDto,
  PromotionBenefitDto,
  PromotionConditionDto,
  QuoteDto,
  RecordTipDto,
  RecordVisitDto,
  ReverseRewardsDto,
  SnapshotDto,
  StoredValueEntryDto,
} from './growth.types';

const CONDITION_KINDS = new Set([
  'DAY_OF_WEEK',
  'TIME_WINDOW',
  'RESOURCE',
  'RESOURCE_CATEGORY',
  'ITEM',
  'ITEM_CATEGORY',
  'MEMBER',
  'CUSTOMER',
  'SESSION_LENGTH',
  'PARTY_SIZE',
  'SPEND',
  'CODE',
  'BOOKING_CHANNEL',
]);
const CONDITION_OPERATORS = new Set(['EQ', 'IN', 'GTE', 'LTE', 'BETWEEN']);
const BENEFIT_KINDS = new Set([
  'PERCENT',
  'FIXED',
  'FIXED_PRICE',
  'FREE_MINUTES',
  'BUNDLE',
  'BOGO',
]);

@Injectable()
export class CommerceGrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPromotions(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const [rules, conditions, benefits] = await Promise.all([
      this.prisma.promotionRule.findMany({
        where: { shopId },
        orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.ruleCondition.findMany({ where: { shopId } }),
      this.prisma.ruleBenefit.findMany({ where: { shopId } }),
    ]);
    return rules.map((rule) => ({
      ...rule,
      conditions: conditions.filter((condition) => condition.promotionId === rule.id),
      benefits: benefits.filter((benefit) => benefit.promotionId === rule.id),
    }));
  }

  async createPromotion(actor: JwtAccessPayload, dto: CreatePromotionDto) {
    const shopId = requireShopId(actor);
    const conditions = this.normalizeConditions(dto.conditions);
    const benefits = this.normalizeBenefits(dto);
    this.validatePromotion(dto, conditions, benefits);

    const row = await this.prisma.$transaction(async (tx) => {
      const rule = await tx.promotionRule.create({
        data: {
          shopId,
          code: dto.code?.trim().toUpperCase() || null,
          name: dto.name.trim(),
          kind: dto.kind,
          valueBps: dto.valueBps,
          amountMinor: dto.amountMinor,
          priority: dto.priority ?? 0,
          stackable: dto.stackable ?? true,
          exclusiveGroup: dto.exclusiveGroup?.trim() || null,
          minSubtotalMinor: Math.max(0, dto.minSubtotalMinor ?? 0),
          requiresCode: dto.requiresCode ?? Boolean(dto.code),
          startsAt: dto.startsAt ? this.date(dto.startsAt, 'startsAt') : null,
          endsAt: dto.endsAt ? this.date(dto.endsAt, 'endsAt') : null,
          conditions: {
            schemaVersion: 1,
            conditions,
            benefits,
          } as Prisma.InputJsonValue,
        },
      });

      if (conditions.length > 0) {
        await tx.ruleCondition.createMany({
          data: conditions.map((condition) => ({
            shopId,
            promotionId: rule.id,
            kind: condition.kind,
            operator: condition.operator ?? 'EQ',
            value: condition.value as Prisma.InputJsonValue,
          })),
        });
      }
      if (benefits.length > 0) {
        await tx.ruleBenefit.createMany({
          data: benefits.map((benefit) => ({
            shopId,
            promotionId: rule.id,
            kind: benefit.kind,
            value: benefit.value as Prisma.InputJsonValue,
          })),
        });
      }
      return rule;
    });

    await this.record(
      actor,
      'promotion.create',
      'Created deterministic promotion rule',
      {
        promotionId: row.id,
        name: row.name,
        conditionCount: conditions.length,
        benefitCount: benefits.length,
      },
    );
    return { ...row, conditions, benefits };
  }

  async listPackages(actor: JwtAccessPayload) {
    return this.prisma.packageDefinition.findMany({
      where: { shopId: requireShopId(actor) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createPackage(actor: JwtAccessPayload, dto: CreatePackageDto) {
    const shopId = requireShopId(actor);
    if (!Number.isInteger(dto.priceMinor) || dto.priceMinor < 0) {
      throw new BadRequestException(
        'Package price must be a non-negative integer.',
      );
    }
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const row = await this.prisma.packageDefinition.create({
      data: {
        shopId,
        name: dto.name.trim(),
        priceMinor: dto.priceMinor,
        currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
        components: dto.components as Prisma.InputJsonValue,
      },
    });
    await this.record(actor, 'package.create', 'Created package/bundle definition', {
      packageId: row.id,
      name: row.name,
      estimatedCostMinor: this.packageCostMinor(row),
    });
    return { ...row, estimatedCostMinor: this.packageCostMinor(row) };
  }

  async quote(actor: JwtAccessPayload, dto: QuoteDto) {
    const shopId = requireShopId(actor);
    if (!Number.isInteger(dto.subtotalMinor) || dto.subtotalMinor < 0) {
      throw new BadRequestException('subtotalMinor must be a non-negative integer.');
    }
    const now = dto.context?.at
      ? this.date(dto.context.at, 'context.at')
      : new Date();

    const rules = await this.prisma.promotionRule.findMany({
      where: { shopId, active: true },
    });
    const promotionIds = rules.map((rule) => rule.id);
    const [conditionRows, benefitRows] = await Promise.all([
      promotionIds.length
        ? this.prisma.ruleCondition.findMany({
            where: { shopId, promotionId: { in: promotionIds } },
          })
        : Promise.resolve([]),
      promotionIds.length
        ? this.prisma.ruleBenefit.findMany({
            where: { shopId, promotionId: { in: promotionIds } },
          })
        : Promise.resolve([]),
    ]);

    let packages: PackageDefinition[] = [];
    if (dto.packageIds?.length) {
      packages = await this.prisma.packageDefinition.findMany({
        where: { shopId, id: { in: dto.packageIds }, active: true },
      });
      if (packages.length !== new Set(dto.packageIds).size) {
        throw new NotFoundException('One or more active packages were not found.');
      }
    }

    const requestedIds = new Set(dto.promotionIds ?? []);
    const requestedCodes = new Set(
      (dto.promotionCodes ?? []).map((code) => code.trim().toUpperCase()),
    );
    const typedRules: PromotionForQuote[] = rules
      .filter((rule) => {
        if (rule.startsAt && rule.startsAt > now) return false;
        if (rule.endsAt && rule.endsAt <= now) return false;
        if (!rule.requiresCode) return true;
        return (
          requestedIds.has(rule.id) ||
          (rule.code != null && requestedCodes.has(rule.code.toUpperCase()))
        );
      })
      .map((rule) =>
        this.toPromotionForQuote(rule, conditionRows, benefitRows),
      );

    const packageMinor = packages.reduce(
      (sum, definition) => sum + definition.priceMinor,
      0,
    );
    const packageCostMinor = packages.reduce(
      (sum, definition) => sum + this.packageCostMinor(definition),
      0,
    );
    const subtotalMinor = dto.subtotalMinor + packageMinor;
    const context = this.pricingContext(dto, now, requestedCodes);
    const quote = computePricingQuote({
      subtotalMinor,
      taxMinor: dto.taxMinor,
      tipMinor: dto.tipMinor,
      tipBps: dto.tipBps,
      promotions: typedRules,
      context,
    });

    return {
      ...quote,
      packageMinor,
      packageCostMinor,
      contributionBeforeOtherCostsMinor:
        quote.totalMinor - quote.taxMinor - quote.tipMinor - packageCostMinor,
      packages: packages.map((definition) => ({
        id: definition.id,
        name: definition.name,
        priceMinor: definition.priceMinor,
        estimatedCostMinor: this.packageCostMinor(definition),
        currency: definition.currency,
      })),
      explanations: quote.appliedPromotions.map((promotion) => promotion.explanation),
      currency: packages[0]?.currency ?? null,
    };
  }

  async snapshot(actor: JwtAccessPayload, dto: SnapshotDto) {
    const shopId = requireShopId(actor);
    if (!dto.sourceType?.trim() || !dto.sourceId?.trim()) {
      throw new BadRequestException('sourceType and sourceId are required.');
    }
    const quote = await this.quote(actor, dto);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const rules = {
      schemaVersion: 1,
      appliedPromotions: quote.appliedPromotions,
      explanations: quote.explanations,
      packages: quote.packages,
      packageMinor: quote.packageMinor,
      packageCostMinor: quote.packageCostMinor,
      contributionBeforeOtherCostsMinor: quote.contributionBeforeOtherCostsMinor,
    };
    const payload = {
      sourceType: dto.sourceType.trim().toUpperCase(),
      sourceId: dto.sourceId.trim(),
      subtotalMinor: quote.subtotalMinor,
      discountMinor: quote.discountMinor,
      taxMinor: quote.taxMinor,
      tipMinor: quote.tipMinor,
      totalMinor: quote.totalMinor,
      rules,
    };
    const pricingHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    const currency = (
      dto.currency ??
      quote.currency ??
      shop?.currency ??
      'EUR'
    ).toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pricingSnapshot.findUnique({
        where: {
          shopId_sourceType_sourceId_pricingHash: {
            shopId,
            sourceType: payload.sourceType,
            sourceId: payload.sourceId,
            pricingHash,
          },
        },
      });
      const snapshot =
        existing ??
        (await tx.pricingSnapshot.create({
          data: {
            shopId,
            sourceType: payload.sourceType,
            sourceId: payload.sourceId,
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
        }));

      for (const applied of quote.appliedPromotions) {
        const correlationId = createHash('sha256')
          .update(
            `${snapshot.id}:${applied.id}:${applied.benefitKind}:${applied.discountMinor}`,
          )
          .digest('hex');
        await tx.ruleApplication.upsert({
          where: { shopId_correlationId: { shopId, correlationId } },
          create: {
            shopId,
            promotionId: applied.id,
            sourceType: payload.sourceType,
            sourceId: payload.sourceId,
            pricingSnapshotId: snapshot.id,
            benefitKind: applied.benefitKind,
            discountMinor: applied.discountMinor,
            explanation: applied.explanation,
            conditionSnapshot:
              applied.conditionSnapshot as Prisma.InputJsonValue,
            benefitSnapshot: applied.benefitSnapshot as Prisma.InputJsonValue,
            correlationId,
          },
          update: {},
        });
      }
      const applications = await tx.ruleApplication.findMany({
        where: { shopId, pricingSnapshotId: snapshot.id },
        orderBy: { createdAt: 'asc' },
      });
      return { snapshot, applications };
    });

    await this.record(actor, 'pricing.snapshot', 'Stored immutable pricing evidence', {
      snapshotId: result.snapshot.id,
      sourceType: result.snapshot.sourceType,
      sourceId: result.snapshot.sourceId,
      totalMinor: result.snapshot.totalMinor,
      applicationCount: result.applications.length,
    });
    return result;
  }

  async recordTip(actor: JwtAccessPayload, dto: RecordTipDto) {
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const signed = signedLedgerAmount(dto.type, dto.amountMinor, ['REFUND']);
    if (dto.guestCheckId) {
      const check = await this.prisma.guestCheck.findFirst({
        where: { id: dto.guestCheckId, shopId },
      });
      if (!check) throw new NotFoundException('Guest check not found.');
    }
    if (dto.paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: dto.paymentId, shopId, status: 'SUCCESS' },
      });
      if (!payment) {
        throw new ConflictException('Successful payment not found.');
      }
    }
    const row = await this.prisma.tipLedgerEntry.upsert({
      where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      create: {
        shopId,
        guestCheckId: dto.guestCheckId,
        paymentId: dto.paymentId,
        type: dto.type,
        amountMinor: signed,
        currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
        correlationId: dto.correlationId,
        reason: dto.reason,
        actorUserId: actor.sub,
      },
      update: {},
    });
    await this.record(actor, 'tip.record', 'Recorded append-only gratuity movement', {
      tipEntryId: row.id,
      type: row.type,
      amountMinor: row.amountMinor,
      channel: row.paymentId ? 'CARD' : 'CASH',
    });
    return row;
  }

  async tipReport(actor: JwtAccessPayload, from: Date, to: Date) {
    const shopId = requireShopId(actor);
    this.assertRange(from, to);
    const rows = await this.prisma.tipLedgerEntry.findMany({
      where: { shopId, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'asc' },
    });
    const totalMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
    const cardMinor = rows
      .filter((row) => row.paymentId != null)
      .reduce((sum, row) => sum + row.amountMinor, 0);
    return {
      from,
      to,
      totalMinor,
      cardMinor,
      cashMinor: totalMinor - cardMinor,
      payoutReadyMinor: totalMinor,
      entries: rows,
    };
  }

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

    const existingIdentity = await this.prisma.customerIdentity.findFirst({
      where: {
        shopId,
        OR: [
          ...(email ? [{ kind: 'EMAIL', normalizedValue: email }] : []),
          ...(phone ? [{ kind: 'PHONE', normalizedValue: phone }] : []),
        ],
      },
    });
    if (existingIdentity) {
      return this.requireCustomer(shopId, existingIdentity.customerId);
    }

    const row = await this.prisma.$transaction(async (tx) => {
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
      const customer = await tx.customerProfile.create({
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
      await this.ensureIdentities(tx, shopId, customer.id, email, phone);
      return customer;
    });

    await this.audit.record(actor, {
      section: 'reservation',
      action: 'customer.create',
      summary: 'Created customer profile',
      meta: {
        customerId: row.id,
        hasMarketingConsent: Boolean(row.marketingConsentAt),
      },
    });
    return row;
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
      const [canonical, merged] = await Promise.all([
        tx.customerProfile.findFirst({
          where: { id: canonicalCustomerId, shopId },
        }),
        tx.customerProfile.findFirst({
          where: { id: dto.mergedCustomerId, shopId },
        }),
      ]);
      if (!canonical || !merged) {
        throw new NotFoundException('Customer record not found.');
      }

      const mergedIdentities = await tx.customerIdentity.findMany({
        where: { shopId, customerId: merged.id },
      });
      let movedIdentities = 0;
      for (const identity of mergedIdentities) {
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

      const [loyalty, wallets, visits, reviewProofs] = await Promise.all([
        tx.loyaltyLedgerEntry.updateMany({
          where: { shopId, customerId: merged.id },
          data: { customerId: canonical.id },
        }),
        tx.storedValueAccount.updateMany({
          where: { shopId, customerId: merged.id },
          data: { customerId: canonical.id },
        }),
        tx.customerVisit.updateMany({
          where: { shopId, customerId: merged.id },
          data: { customerId: canonical.id },
        }),
        tx.reviewVisitProof.updateMany({
          where: { shopId, customerId: merged.id },
          data: { customerId: canonical.id },
        }),
      ]);

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
        const canonicalTier = tiers.find(
          (tier) => tier.id === canonicalMembership.tierId,
        );
        const mergedTier = tiers.find((tier) => tier.id === mergedMembership.tierId);
        if ((mergedTier?.rank ?? 0) > (canonicalTier?.rank ?? 0)) {
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

      const updatedCanonical = await tx.customerProfile.update({
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
        reviewProofs: reviewProofs.count,
        membership: membershipAction,
      };
      const audit = await tx.customerMergeAudit.create({
        data: {
          shopId,
          canonicalCustomerId: canonical.id,
          mergedCustomerId: merged.id,
          reason: dto.reason?.trim() || null,
          referenceCounts: referenceCounts as Prisma.InputJsonValue,
          actorUserId: actor.sub,
        },
      });
      return { customer: updatedCanonical, audit, referenceCounts };
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
    const row = await this.prisma.membershipTier.create({
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
      tierId: row.id,
      code: row.code,
      benefits: row.benefits,
    });
    return row;
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
    const row = await this.prisma.customerMembership.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: {
        shopId,
        customerId,
        tierId: tier.id,
        expiresAt: dto.expiresAt
          ? this.date(dto.expiresAt, 'expiresAt')
          : undefined,
      },
      update: {
        tierId: tier.id,
        status: 'ACTIVE',
        expiresAt: dto.expiresAt
          ? this.date(dto.expiresAt, 'expiresAt')
          : null,
      },
    });
    await this.record(actor, 'membership.enroll', 'Enrolled customer', {
      customerId,
      tierId: tier.id,
    });
    return { membership: row, tier };
  }

  async loyalty(
    actor: JwtAccessPayload,
    customerId: string,
    dto: LoyaltyEntryDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireCustomer(shopId, customerId);
    const points = this.signedPoints(dto.type, dto.points);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${shopId}:${customerId}`}))`;
      const existing = await tx.loyaltyLedgerEntry.findUnique({
        where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      });
      if (existing) return existing;
      const prior = await tx.loyaltyLedgerEntry.findMany({
        where: { shopId, customerId },
        select: { points: true },
      });
      if (
        dto.type !== 'REVERSAL' &&
        projectPointsBalance(prior) + points < 0
      ) {
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
      entryId: row.id,
      type: row.type,
      points: row.points,
    });
    return {
      entry: row,
      balance: await this.loyaltyBalance(shopId, customerId),
    };
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
      if (existing) return { entry: existing, reversedPoints: -existing.points };

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
    return {
      ...result,
      balance: await this.loyaltyBalance(shopId, customerId),
    };
  }

  async createStoredAccount(
    actor: JwtAccessPayload,
    dto: CreateStoredValueAccountDto,
  ) {
    const shopId = requireShopId(actor);
    if (dto.customerId) await this.requireCustomer(shopId, dto.customerId);
    const code =
      dto.code?.trim() || randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
    const codeHash = this.hashCode(code);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const row = await this.prisma.storedValueAccount.create({
      data: {
        shopId,
        customerId: dto.customerId,
        codeHash,
        currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
      },
    });
    await this.record(
      actor,
      'stored-value.account.create',
      'Created stored-value account',
      { accountId: row.id, customerId: row.customerId },
    );
    return { account: row, code };
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
    if (!account) {
      throw new NotFoundException('Active stored-value account not found.');
    }
    const amount = signedLedgerAmount(dto.type, dto.amountMinor, ['REDEEM']);
    if (dto.paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: dto.paymentId, shopId, status: 'SUCCESS' },
      });
      if (!payment) {
        throw new ConflictException(
          'Successful payment not found for stored-value load.',
        );
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stored-value:${shopId}:${accountId}`}))`;
      const existing = await tx.storedValueLedgerEntry.findUnique({
        where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      });
      if (existing) return existing;
      const prior = await tx.storedValueLedgerEntry.findMany({
        where: { shopId, accountId },
        select: { amountMinor: true },
      });
      if (projectSignedBalance(prior) + amount < 0) {
        throw new ConflictException(
          'Stored-value redemption cannot create a negative balance.',
        );
      }
      return tx.storedValueLedgerEntry.create({
        data: {
          shopId,
          accountId,
          type: dto.type,
          amountMinor: amount,
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
    await this.record(
      actor,
      'stored-value.ledger',
      'Recorded stored-value movement',
      {
        accountId,
        entryId: row.id,
        type: row.type,
        amountMinor: row.amountMinor,
      },
    );
    return {
      entry: row,
      balanceMinor: await this.storedBalance(shopId, accountId),
    };
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
    const row = await this.prisma.customerVisit.upsert({
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
      visitId: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
    });
    return row;
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
    const publicTokenHash = createHash('sha256').update(raw).digest('hex');
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const proof = await this.prisma.reviewVisitProof.create({
      data: {
        shopId,
        customerId,
        visitId,
        publicTokenHash,
        validUntil,
      },
    });
    await this.record(actor, 'customer.review-proof.issue', 'Issued verified-visit review proof', {
      customerId,
      visitId,
      proofId: proof.id,
    });
    return { token: raw, validUntil, proofId: proof.id };
  }

  async customerHistory(actor: JwtAccessPayload, customerId: string) {
    const shopId = requireShopId(actor);
    const customer = await this.requireCustomer(shopId, customerId);
    const [
      identities,
      membership,
      loyalty,
      accounts,
      visits,
      mergeHistory,
    ] = await Promise.all([
      this.prisma.customerIdentity.findMany({
        where: { shopId, customerId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.customerMembership.findFirst({
        where: { shopId, customerId },
      }),
      this.prisma.loyaltyLedgerEntry.findMany({
        where: { shopId, customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.storedValueAccount.findMany({
        where: { shopId, customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerVisit.findMany({
        where: { shopId, customerId },
        orderBy: { completedAt: 'desc' },
        take: 200,
      }),
      this.prisma.customerMergeAudit.findMany({
        where: { shopId, canonicalCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const stored = await Promise.all(
      accounts.map(async (account) => ({
        account,
        balanceMinor: await this.storedBalance(shopId, account.id),
      })),
    );
    const tier = membership
      ? await this.prisma.membershipTier.findFirst({
          where: { id: membership.tierId, shopId },
        })
      : null;
    return {
      customer,
      identities,
      membership: membership ? { ...membership, tier } : null,
      loyaltyBalance: projectPointsBalance(loyalty),
      loyalty,
      storedValue: stored,
      visits,
      mergeHistory,
    };
  }

  private normalizeConditions(
    input: CreatePromotionDto['conditions'],
  ): PromotionConditionDto[] {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return Object.entries(input).map(([kind, value]) => ({
      kind: kind.toUpperCase() as PromotionConditionDto['kind'],
      operator: 'EQ',
      value,
    }));
  }

  private normalizeBenefits(dto: CreatePromotionDto): PromotionBenefitDto[] {
    if (dto.benefits?.length) return dto.benefits;
    if (dto.kind === 'PERCENT') {
      return [
        { kind: 'PERCENT', value: { valueBps: dto.valueBps ?? 0 } },
      ];
    }
    if (dto.kind === 'FIXED_PRICE') {
      return [
        { kind: 'FIXED_PRICE', value: { priceMinor: dto.amountMinor ?? 0 } },
      ];
    }
    return [
      { kind: dto.kind, value: { amountMinor: dto.amountMinor ?? 0 } },
    ];
  }

  private validatePromotion(
    dto: CreatePromotionDto,
    conditions: PromotionConditionDto[],
    benefits: PromotionBenefitDto[],
  ) {
    if (!dto.name?.trim()) throw new BadRequestException('Promotion name is required.');
    for (const condition of conditions) {
      if (!CONDITION_KINDS.has(condition.kind)) {
        throw new BadRequestException(`Unsupported condition kind: ${condition.kind}`);
      }
      if (!CONDITION_OPERATORS.has(condition.operator ?? 'EQ')) {
        throw new BadRequestException(
          `Unsupported condition operator: ${condition.operator}`,
        );
      }
    }
    for (const benefit of benefits) {
      if (!BENEFIT_KINDS.has(benefit.kind)) {
        throw new BadRequestException(`Unsupported benefit kind: ${benefit.kind}`);
      }
    }
    if (
      dto.kind === 'PERCENT' &&
      (!Number.isInteger(dto.valueBps) ||
        Number(dto.valueBps) < 0 ||
        Number(dto.valueBps) > 10_000)
    ) {
      throw new BadRequestException(
        'PERCENT promotion requires valueBps from 0 to 10000.',
      );
    }
    if (
      ['FIXED', 'FIXED_PRICE'].includes(dto.kind) &&
      (!Number.isInteger(dto.amountMinor) || Number(dto.amountMinor) < 0)
    ) {
      throw new BadRequestException(
        `${dto.kind} promotion requires non-negative amountMinor.`,
      );
    }
  }

  private toPromotionForQuote(
    rule: PromotionRule,
    conditions: Array<{
      promotionId: string;
      kind: string;
      operator: string;
      value: Prisma.JsonValue;
    }>,
    benefits: Array<{
      promotionId: string;
      kind: string;
      value: Prisma.JsonValue;
    }>,
  ): PromotionForQuote {
    const explicitConditions: RuleConditionInput[] = conditions
      .filter((condition) => condition.promotionId === rule.id)
      .map((condition) => ({
        kind: condition.kind,
        operator: condition.operator,
        value: condition.value,
      }));
    const explicitBenefits: RuleBenefitInput[] = benefits
      .filter((benefit) => benefit.promotionId === rule.id)
      .map((benefit) => ({ kind: benefit.kind, value: benefit.value }));
    return {
      id: rule.id,
      name: rule.name,
      code: rule.code,
      kind: rule.kind,
      valueBps: rule.valueBps,
      amountMinor: rule.amountMinor,
      priority: rule.priority,
      stackable: rule.stackable,
      exclusiveGroup: rule.exclusiveGroup,
      minSubtotalMinor: rule.minSubtotalMinor,
      conditions:
        explicitConditions.length > 0
          ? explicitConditions
          : this.legacyConditions(rule.conditions),
      benefits: explicitBenefits,
    };
  }

  private legacyConditions(value: Prisma.JsonValue): RuleConditionInput[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, Prisma.JsonValue>;
    if (record.schemaVersion === 1 && Array.isArray(record.conditions)) {
      return record.conditions
        .filter(
          (condition): condition is Record<string, Prisma.JsonValue> =>
            condition != null &&
            typeof condition === 'object' &&
            !Array.isArray(condition),
        )
        .map((condition) => ({
          kind: String(condition.kind ?? ''),
          operator: String(condition.operator ?? 'EQ'),
          value: condition.value,
        }))
        .filter((condition) => CONDITION_KINDS.has(condition.kind));
    }
    return [];
  }

  private pricingContext(
    dto: QuoteDto,
    at: Date,
    promotionCodes: Set<string>,
  ): PricingContext {
    return {
      at,
      resourceId: dto.context?.resourceId,
      resourceCategoryId: dto.context?.resourceCategoryId,
      itemIds: dto.context?.itemIds,
      itemCategoryIds: dto.context?.itemCategoryIds,
      customerId: dto.context?.customerId,
      isMember: dto.context?.isMember,
      sessionMinutes: dto.context?.sessionMinutes,
      partySize: dto.context?.partySize,
      bookingChannel: dto.context?.bookingChannel,
      promotionCodes: [...promotionCodes],
    };
  }

  private packageCostMinor(definition: PackageDefinition) {
    if (!Array.isArray(definition.components)) return 0;
    return definition.components.reduce((sum, component) => {
      if (
        component == null ||
        typeof component !== 'object' ||
        Array.isArray(component)
      ) {
        return sum;
      }
      const value = component as Record<string, Prisma.JsonValue>;
      const cost = Number(value.costMinor ?? 0);
      const quantity = Number(value.quantity ?? 1);
      if (!Number.isFinite(cost) || !Number.isFinite(quantity)) return sum;
      return sum + Math.max(0, Math.round(cost)) * Math.max(0, quantity);
    }, 0);
  }

  private async ensureIdentities(
    tx: Prisma.TransactionClient,
    shopId: string,
    customerId: string,
    email: string | null,
    phone: string | null,
  ) {
    const values = [
      ...(email ? [{ kind: 'EMAIL', normalizedValue: email }] : []),
      ...(phone ? [{ kind: 'PHONE', normalizedValue: phone }] : []),
    ];
    for (const identity of values) {
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
      const ledger = await this.prisma.ledgerEntry.findMany({
        where: { shopId, guestCheckId: row.id },
      });
      return {
        completedAt: row.settledAt,
        reservationId: null,
        guestCheckId: row.id,
        operationsSessionId: null,
        eventRequestId: null,
        settledAmountMinor: this.ledgerRevenueMinor(ledger),
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
    if (!execution?.completedAt) {
      throw new ConflictException('Event is not completed.');
    }
    const check = execution.guestCheckId
      ? await this.prisma.guestCheck.findFirst({
          where: { id: execution.guestCheckId, shopId, status: 'SETTLED' },
        })
      : null;
    const ledger = check
      ? await this.prisma.ledgerEntry.findMany({
          where: { shopId, guestCheckId: check.id },
        })
      : [];
    return {
      completedAt: execution.completedAt,
      reservationId: null,
      guestCheckId: check?.id ?? null,
      operationsSessionId: null,
      eventRequestId: dto.sourceId,
      settledAmountMinor: check ? this.ledgerRevenueMinor(ledger) : null,
      currency: check?.currency ?? null,
    };
  }

  private ledgerRevenueMinor(
    rows: Array<{ kind: string; amount: { toString(): string } }>,
  ) {
    return rows.reduce((sum, row) => {
      const amount = this.decimalToMinor(row.amount);
      if (row.kind === 'SALE') return sum + amount;
      if (row.kind === 'REFUND') return sum - amount;
      return sum;
    }, 0);
  }

  private signedPoints(type: string, points: number) {
    if (!Number.isInteger(points) || points === 0) {
      throw new BadRequestException('Points must be a non-zero integer.');
    }
    if (type === 'ADJUST' || type === 'REVERSAL') return points;
    return ['REDEEM', 'EXPIRE'].includes(type)
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

  private hashCode(code: string) {
    return createHash('sha256')
      .update(code.trim().toUpperCase())
      .digest('hex');
  }

  private normalizeEmail(value?: string) {
    const email = value?.trim().toLowerCase();
    return email || null;
  }

  private normalizePhone(value?: string) {
    const phone = value?.trim().replace(/[\s().-]/g, '');
    return phone || null;
  }

  private async requireCustomer(shopId: string, id: string) {
    const row = await this.prisma.customerProfile.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new NotFoundException('Customer not found.');
    return row;
  }

  private date(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date/time.`);
    }
    return date;
  }

  private assertRange(from: Date, to: Date) {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from
    ) {
      throw new BadRequestException('End must be after start.');
    }
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
    return this.audit.record(actor, {
      section: 'finance',
      action,
      summary,
      meta,
    });
  }
}
