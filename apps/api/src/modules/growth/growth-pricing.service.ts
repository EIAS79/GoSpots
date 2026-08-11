import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PackageDefinition, type PromotionRule } from '@prisma/client';
import { createHash } from 'node:crypto';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  computePricingQuote,
  signedLedgerAmount,
  type PricingContext,
  type PromotionEvaluation,
  type PromotionEvaluationStatus,
  type PromotionForQuote,
  type RuleBenefitInput,
  type RuleConditionInput,
} from './growth.rules';
import type {
  CreatePackageDto,
  CreatePromotionDto,
  PromotionBenefitDto,
  PromotionConditionDto,
  QuoteDto,
  RecordTipDto,
  SnapshotDto,
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
export class GrowthPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPromotions(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const rules = await this.prisma.promotionRule.findMany({
      where: { shopId },
      orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });
    const ids = rules.map((rule) => rule.id);
    const conditions = ids.length
      ? await this.prisma.ruleCondition.findMany({
          where: { shopId, promotionId: { in: ids } },
        })
      : [];
    const benefits = ids.length
      ? await this.prisma.ruleBenefit.findMany({
          where: { shopId, promotionId: { in: ids } },
        })
      : [];
    return rules.map((rule) => ({
      ...rule,
      conditions: conditions.filter((row) => row.promotionId === rule.id),
      benefits: benefits.filter((row) => row.promotionId === rule.id),
    }));
  }

  async createPromotion(actor: JwtAccessPayload, dto: CreatePromotionDto) {
    const shopId = requireShopId(actor);
    const conditions = this.normalizeConditions(dto.conditions);
    const benefits = this.normalizeBenefits(dto);
    this.validatePromotion(dto, conditions, benefits);

    const rule = await this.prisma.$transaction(async (tx) => {
      const created = await tx.promotionRule.create({
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
          startsAt: dto.startsAt ? this.parseDate(dto.startsAt, 'startsAt') : null,
          endsAt: dto.endsAt ? this.parseDate(dto.endsAt, 'endsAt') : null,
          conditions: {
            schemaVersion: 1,
            conditions,
            benefits,
          } as Prisma.InputJsonValue,
        },
      });
      if (conditions.length) {
        await tx.ruleCondition.createMany({
          data: conditions.map((condition) => ({
            shopId,
            promotionId: created.id,
            kind: condition.kind,
            operator: condition.operator ?? 'EQ',
            value: condition.value as Prisma.InputJsonValue,
          })),
        });
      }
      if (benefits.length) {
        await tx.ruleBenefit.createMany({
          data: benefits.map((benefit) => ({
            shopId,
            promotionId: created.id,
            kind: benefit.kind,
            value: benefit.value as Prisma.InputJsonValue,
          })),
        });
      }
      return created;
    });

    await this.record(actor, 'promotion.create', 'Created promotion rule', {
      promotionId: rule.id,
      conditionCount: conditions.length,
      benefitCount: benefits.length,
    });
    return { ...rule, conditions, benefits };
  }

  listPackages(actor: JwtAccessPayload) {
    return this.prisma.packageDefinition.findMany({
      where: { shopId: requireShopId(actor) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createPackage(actor: JwtAccessPayload, dto: CreatePackageDto) {
    const shopId = requireShopId(actor);
    if (!Number.isInteger(dto.priceMinor) || dto.priceMinor < 0) {
      throw new BadRequestException('Package price must be non-negative.');
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
    const estimatedCostMinor = this.packageCostMinor(row);
    await this.record(actor, 'package.create', 'Created package definition', {
      packageId: row.id,
      estimatedCostMinor,
    });
    return { ...row, estimatedCostMinor };
  }

  async quote(actor: JwtAccessPayload, dto: QuoteDto) {
    const shopId = requireShopId(actor);
    if (!Number.isInteger(dto.subtotalMinor) || dto.subtotalMinor < 0) {
      throw new BadRequestException('subtotalMinor must be non-negative.');
    }
    const at = dto.context?.at
      ? this.parseDate(dto.context.at, 'context.at')
      : new Date();
    const rules = await this.prisma.promotionRule.findMany({
      where: { shopId, active: true },
    });
    const ids = rules.map((rule) => rule.id);
    const conditionRows = ids.length
      ? await this.prisma.ruleCondition.findMany({
          where: { shopId, promotionId: { in: ids } },
        })
      : [];
    const benefitRows = ids.length
      ? await this.prisma.ruleBenefit.findMany({
          where: { shopId, promotionId: { in: ids } },
        })
      : [];

    const requestedIds = new Set(dto.promotionIds ?? []);
    const requestedCodes = new Set(
      (dto.promotionCodes ?? []).map((code) => code.trim().toUpperCase()),
    );

    let packages: PackageDefinition[] = [];
    if (dto.packageIds?.length) {
      packages = await this.prisma.packageDefinition.findMany({
        where: { shopId, id: { in: dto.packageIds }, active: true },
      });
      if (packages.length !== new Set(dto.packageIds).size) {
        throw new NotFoundException('One or more active packages were not found.');
      }
    }
    const packageMinor = packages.reduce((sum, row) => sum + row.priceMinor, 0);
    const packageCostMinor = packages.reduce(
      (sum, row) => sum + this.packageCostMinor(row),
      0,
    );
    const adjustedSubtotalMinor = dto.subtotalMinor + packageMinor;
    const context: PricingContext = {
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
      promotionCodes: [...requestedCodes],
    };

    const eligible: PromotionForQuote[] = [];
    const preEvaluated: PromotionEvaluation[] = [];
    for (const rule of rules) {
      const quoteRule = this.toQuoteRule(rule, conditionRows, benefitRows);
      let status: PromotionEvaluationStatus | null = null;
      let reason = '';
      if (rule.startsAt && rule.startsAt > at) {
        status = 'SKIPPED_NOT_STARTED';
        reason = `Promotion starts at ${rule.startsAt.toISOString()}.`;
      } else if (rule.endsAt && rule.endsAt <= at) {
        status = 'SKIPPED_EXPIRED';
        reason = `Promotion ended at ${rule.endsAt.toISOString()}.`;
      } else if (
        rule.requiresCode &&
        !requestedIds.has(rule.id) &&
        !Boolean(rule.code && requestedCodes.has(rule.code.toUpperCase()))
      ) {
        status = 'SKIPPED_CODE_REQUIRED';
        reason = 'Promotion requires an explicit matching promotion id or code.';
      }

      if (!status) {
        eligible.push(quoteRule);
        continue;
      }
      preEvaluated.push(
        this.prefilterEvaluation(quoteRule, status, reason, adjustedSubtotalMinor),
      );
    }

    const quote = computePricingQuote({
      subtotalMinor: adjustedSubtotalMinor,
      taxMinor: dto.taxMinor,
      tipMinor: dto.tipMinor,
      tipBps: dto.tipBps,
      promotions: eligible,
      context,
    });
    const evaluatedPromotions = [...preEvaluated, ...quote.evaluatedPromotions].sort(
      (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
    );
    const evaluationInput = {
      evaluatedAt: at.toISOString(),
      requestedSubtotalMinor: dto.subtotalMinor,
      packageAdjustedSubtotalMinor: adjustedSubtotalMinor,
      requestedTaxMinor: dto.taxMinor ?? null,
      requestedTipMinor: dto.tipMinor ?? null,
      requestedTipBps: dto.tipBps ?? null,
      requestedPromotionIds: [...requestedIds].sort(),
      requestedPromotionCodes: [...requestedCodes].sort(),
      requestedPackageIds: [...(dto.packageIds ?? [])].sort(),
      context: {
        resourceId: dto.context?.resourceId ?? null,
        resourceCategoryId: dto.context?.resourceCategoryId ?? null,
        itemIds: [...(dto.context?.itemIds ?? [])].sort(),
        itemCategoryIds: [...(dto.context?.itemCategoryIds ?? [])].sort(),
        customerId: dto.context?.customerId ?? null,
        isMember: dto.context?.isMember ?? null,
        sessionMinutes: dto.context?.sessionMinutes ?? null,
        partySize: dto.context?.partySize ?? null,
        bookingChannel: dto.context?.bookingChannel ?? null,
      },
    };
    return {
      ...quote,
      evaluatedPromotions,
      evaluationInput,
      packageMinor,
      packageCostMinor,
      contributionBeforeOtherCostsMinor:
        quote.totalMinor - quote.taxMinor - quote.tipMinor - packageCostMinor,
      packages: packages.map((row) => ({
        id: row.id,
        name: row.name,
        priceMinor: row.priceMinor,
        estimatedCostMinor: this.packageCostMinor(row),
        currency: row.currency,
      })),
      explanations: quote.appliedPromotions.map((row) => row.explanation),
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
    const sourceType = dto.sourceType.trim().toUpperCase();
    const sourceId = dto.sourceId.trim();
    const rules = {
      schemaVersion: 2,
      evaluationInput: quote.evaluationInput,
      evaluatedPromotions: quote.evaluatedPromotions,
      appliedPromotions: quote.appliedPromotions,
      explanations: quote.explanations,
      packages: quote.packages,
      packageMinor: quote.packageMinor,
      packageCostMinor: quote.packageCostMinor,
      contributionBeforeOtherCostsMinor: quote.contributionBeforeOtherCostsMinor,
    };
    const pricingHash = createHash('sha256')
      .update(
        JSON.stringify({
          sourceType,
          sourceId,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          tipMinor: quote.tipMinor,
          totalMinor: quote.totalMinor,
          rules,
        }),
      )
      .digest('hex');
    const currency = (
      dto.currency ?? quote.currency ?? shop?.currency ?? 'EUR'
    ).toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.pricingSnapshot.upsert({
        where: {
          shopId_sourceType_sourceId_pricingHash: {
            shopId,
            sourceType,
            sourceId,
            pricingHash,
          },
        },
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
          .update(
            `${snapshot.id}:${applied.id}:${applied.benefitKind}:${applied.discountMinor}`,
          )
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
      }
      return {
        snapshot,
        applications: await tx.ruleApplication.findMany({
          where: { shopId, pricingSnapshotId: snapshot.id },
          orderBy: { createdAt: 'asc' },
        }),
      };
    });
    await this.record(actor, 'pricing.snapshot', 'Stored immutable pricing evidence', {
      snapshotId: result.snapshot.id,
      applicationCount: result.applications.length,
      evaluatedRuleCount: quote.evaluatedPromotions.length,
    });
    return result;
  }

  async recordTip(actor: JwtAccessPayload, dto: RecordTipDto) {
    const shopId = requireShopId(actor);
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
      if (!payment) throw new ConflictException('Successful payment not found.');
    }
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
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
    await this.record(actor, 'tip.record', 'Recorded gratuity ledger movement', {
      tipEntryId: row.id,
      channel: row.paymentId ? 'CARD' : 'CASH',
      amountMinor: row.amountMinor,
    });
    return row;
  }

  async tipReport(actor: JwtAccessPayload, from: Date, to: Date) {
    const shopId = requireShopId(actor);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('Tip report end must be after start.');
    }
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
      return [{ kind: 'PERCENT', value: { valueBps: dto.valueBps ?? 0 } }];
    }
    if (dto.kind === 'FIXED_PRICE') {
      return [{ kind: 'FIXED_PRICE', value: { priceMinor: dto.amountMinor ?? 0 } }];
    }
    return [{ kind: dto.kind, value: { amountMinor: dto.amountMinor ?? 0 } }];
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
      throw new BadRequestException('PERCENT requires valueBps 0..10000.');
    }
    if (
      (dto.kind === 'FIXED' || dto.kind === 'FIXED_PRICE') &&
      (!Number.isInteger(dto.amountMinor) || Number(dto.amountMinor) < 0)
    ) {
      throw new BadRequestException(`${dto.kind} requires non-negative amountMinor.`);
    }
  }

  private toQuoteRule(
    rule: PromotionRule,
    conditionRows: Array<{
      promotionId: string;
      kind: string;
      operator: string;
      value: Prisma.JsonValue;
    }>,
    benefitRows: Array<{
      promotionId: string;
      kind: string;
      value: Prisma.JsonValue;
    }>,
  ): PromotionForQuote {
    const conditions: RuleConditionInput[] = conditionRows
      .filter((row) => row.promotionId === rule.id)
      .map((row) => ({ kind: row.kind, operator: row.operator, value: row.value }));
    const benefits: RuleBenefitInput[] = benefitRows
      .filter((row) => row.promotionId === rule.id)
      .map((row) => ({ kind: row.kind, value: row.value }));
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
      conditions: conditions.length ? conditions : this.legacyConditions(rule.conditions),
      benefits,
    };
  }

  private prefilterEvaluation(
    rule: PromotionForQuote,
    status: PromotionEvaluationStatus,
    reason: string,
    subtotalMinor: number,
  ): PromotionEvaluation {
    return {
      id: rule.id,
      name: rule.name,
      code: rule.code ?? null,
      kind: rule.kind,
      priority: rule.priority,
      stackable: rule.stackable,
      exclusiveGroup: rule.exclusiveGroup,
      minSubtotalMinor: rule.minSubtotalMinor,
      minSubtotalMatched: subtotalMinor >= rule.minSubtotalMinor,
      status,
      reason,
      remainingBeforeMinor: subtotalMinor,
      discountMinor: 0,
      conditionSnapshot: [...(rule.conditions ?? [])],
      conditionResults: [],
      benefitSnapshots: [...(rule.benefits ?? [])],
      benefitResults: [],
      winningBenefit: null,
    };
  }

  private legacyConditions(value: Prisma.JsonValue): RuleConditionInput[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, Prisma.JsonValue>;
    if (record.schemaVersion !== 1 || !Array.isArray(record.conditions)) return [];
    const result: RuleConditionInput[] = [];
    for (const raw of record.conditions) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const item = raw as Record<string, Prisma.JsonValue>;
      const kind = String(item.kind ?? '');
      if (!CONDITION_KINDS.has(kind)) continue;
      result.push({
        kind,
        operator: String(item.operator ?? 'EQ'),
        value: item.value,
      });
    }
    return result;
  }

  private packageCostMinor(definition: PackageDefinition) {
    if (!Array.isArray(definition.components)) return 0;
    let total = 0;
    for (const component of definition.components) {
      if (!component || typeof component !== 'object' || Array.isArray(component)) {
        continue;
      }
      const value = component as Record<string, Prisma.JsonValue>;
      const cost = Number(value.costMinor ?? 0);
      const quantity = Number(value.quantity ?? 1);
      if (!Number.isFinite(cost) || !Number.isFinite(quantity)) continue;
      total += Math.max(0, Math.round(cost)) * Math.max(0, quantity);
    }
    return total;
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date/time.`);
    }
    return date;
  }

  private record(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    return this.audit.record(actor, { section: 'finance', action, summary, meta });
  }
}
