import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplianceRequestState,
  FinancialReconciliationIssueType,
  FinancialReconciliationStatus,
  LedgerKind,
  OfflinePaymentMinimumRole,
  PaymentOperationState,
  PaymentStatus,
  Prisma,
  RefundState,
} from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import type {
  RunFinancialReconciliationDto,
  UpdateOfflinePaymentPolicyDto,
} from './dto/money-operations.dto';

const ZERO = new Prisma.Decimal(0);
const ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  KITCHEN: 0,
  INVENTORY: 1,
  SERVER: 1,
  STAFF: 1,
  CASHIER: 1,
  SUPERVISOR: 2,
  MANAGER: 3,
  OWNER: 4,
};
const MIN_ROLE_RANK: Record<OfflinePaymentMinimumRole, number> = {
  CASHIER: 1,
  SUPERVISOR: 2,
  MANAGER: 3,
  OWNER: 4,
};

@Injectable()
export class MoneyOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: PaymentConnectorRegistry,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: string) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission as never)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  assertRefundAuthorized(actor: JwtAccessPayload) {
    this.assertPermission(actor, PERMISSIONS.REFUND_EXECUTE);
    return requireShopId(actor);
  }

  async providerReadiness(actor: JwtAccessPayload, provider: string) {
    this.assertPermission(actor, PERMISSIONS.PAYMENT_READ);
    requireShopId(actor);
    const connector = this.connectors.resolve(provider);
    const [capabilities, health] = await Promise.all([
      connector.capabilities(),
      connector.health(),
    ]);
    const readiness = connector.readiness
      ? await connector.readiness()
      : { ready: Boolean(health.ok && capabilities.payments), ok: health.ok, checkedAt: new Date().toISOString(), message: health.message };
    return { provider: connector.provider, capabilities, health, readiness };
  }

  async getOfflinePolicy(actor: JwtAccessPayload) {
    this.assertPermission(actor, PERMISSIONS.SETTINGS_READ);
    const shopId = requireShopId(actor);
    const policy = await this.prisma.offlinePaymentPolicy.findUnique({ where: { shopId } });
    if (policy) return this.serializePolicy(policy);
    return {
      shopId,
      enabled: false,
      maxSingleAmount: '0.0000',
      maxCumulativePendingAmount: '0.0000',
      minimumRole: OfflinePaymentMinimumRole.MANAGER,
      customerWarningText: null,
      forceReconnectAfterMinutes: 30,
    };
  }

  async updateOfflinePolicy(actor: JwtAccessPayload, dto: UpdateOfflinePaymentPolicyDto) {
    this.assertPermission(actor, PERMISSIONS.SETTINGS_WRITE);
    const shopId = requireShopId(actor);
    const maxSingleAmount = new Prisma.Decimal(dto.maxSingleAmount);
    const maxCumulativePendingAmount = new Prisma.Decimal(dto.maxCumulativePendingAmount);
    if (maxSingleAmount.isNegative() || maxCumulativePendingAmount.isNegative()) {
      throw new BadRequestException('Offline payment limits cannot be negative');
    }
    if (dto.enabled && (maxSingleAmount.lte(0) || maxCumulativePendingAmount.lte(0))) {
      throw new BadRequestException('Enabled offline payments require positive risk ceilings');
    }
    const row = await this.prisma.offlinePaymentPolicy.upsert({
      where: { shopId },
      create: {
        shopId,
        enabled: dto.enabled,
        maxSingleAmount,
        maxCumulativePendingAmount,
        minimumRole: dto.minimumRole,
        customerWarningText: dto.customerWarningText?.trim() || null,
        forceReconnectAfterMinutes: dto.forceReconnectAfterMinutes,
        createdById: actor.sub,
        updatedById: actor.sub,
      },
      update: {
        enabled: dto.enabled,
        maxSingleAmount,
        maxCumulativePendingAmount,
        minimumRole: dto.minimumRole,
        customerWarningText: dto.customerWarningText?.trim() || null,
        forceReconnectAfterMinutes: dto.forceReconnectAfterMinutes,
        updatedById: actor.sub,
      },
    });
    return this.serializePolicy(row);
  }

  async evaluateOfflineCollection(actor: JwtAccessPayload, provider: string, amountRaw: string) {
    this.assertPermission(actor, PERMISSIONS.PAYMENT_WRITE);
    const shopId = requireShopId(actor);
    const connector = this.connectors.resolve(provider);
    const capabilities = await connector.capabilities();
    if (!capabilities.offlineCollection) {
      return { allowed: false, reason: 'CONNECTOR_OFFLINE_UNSUPPORTED' as const };
    }
    const policy = await this.prisma.offlinePaymentPolicy.findUnique({ where: { shopId } });
    if (!policy?.enabled) return { allowed: false, reason: 'OFFLINE_PAYMENT_DISABLED' as const };
    const amount = new Prisma.Decimal(amountRaw);
    if (amount.lte(0)) throw new BadRequestException('Amount must be greater than zero');
    if (amount.gt(policy.maxSingleAmount)) return { allowed: false, reason: 'OFFLINE_SINGLE_LIMIT_EXCEEDED' as const };
    const actorRank = ROLE_RANK[String(actor.shopRole ?? '').toUpperCase()] ?? 0;
    if (actorRank < MIN_ROLE_RANK[policy.minimumRole]) {
      return { allowed: false, reason: 'OFFLINE_ROLE_NOT_ALLOWED' as const };
    }
    const pending = await this.prisma.paymentOperation.aggregate({
      where: {
        shopId,
        reconciliationRequired: true,
        state: { in: [PaymentOperationState.UNKNOWN] },
      },
      _sum: { amount: true },
    });
    const pendingAmount = pending._sum.amount ?? ZERO;
    if (pendingAmount.add(amount).gt(policy.maxCumulativePendingAmount)) {
      return { allowed: false, reason: 'OFFLINE_CUMULATIVE_LIMIT_EXCEEDED' as const, pendingAmount: pendingAmount.toFixed(4) };
    }
    return {
      allowed: true,
      reason: null,
      maxSingleAmount: policy.maxSingleAmount.toFixed(4),
      maxCumulativePendingAmount: policy.maxCumulativePendingAmount.toFixed(4),
      pendingAmount: pendingAmount.toFixed(4),
      customerWarningText: policy.customerWarningText,
      forceReconnectAfterMinutes: policy.forceReconnectAfterMinutes,
    };
  }

  async runFinancialReconciliation(actor: JwtAccessPayload, dto: RunFinancialReconciliationDto) {
    this.assertPermission(actor, PERMISSIONS.REPORT_READ);
    const shopId = requireShopId(actor);
    const from = new Date(dto.fromInclusive);
    const to = new Date(dto.toExclusive);
    const businessDate = new Date(dto.businessDate);
    if (!(from < to) || Number.isNaN(businessDate.getTime())) {
      throw new BadRequestException('Invalid reconciliation window');
    }
    const currency = dto.currency.toUpperCase();

    const existing = await this.prisma.financialReconciliationRun.findUnique({
      where: { shopId_businessDate_currency_correlationId: { shopId, businessDate, currency, correlationId: dto.correlationId } },
      include: { issues: true },
    });
    if (existing) return this.serializeRun(existing);

    const [settlements, payments, paymentLedger, refunds, refundLedger, cashSessions, unresolvedPayments, complianceRequests] = await Promise.all([
      this.prisma.checkSettlement.aggregate({
        where: { shopId, state: 'PAID', currency, createdAt: { gte: from, lt: to } },
        _sum: { total: true },
      }),
      this.prisma.payment.aggregate({
        where: { shopId, status: PaymentStatus.SUCCESS, currency, createdAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { shopId, kind: LedgerKind.PAYMENT, currency, createdAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      this.prisma.refund.aggregate({
        where: { shopId, state: RefundState.SUCCEEDED, currency, createdAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { shopId, kind: LedgerKind.REFUND, currency, createdAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      this.prisma.cashSession.findMany({
        where: { shopId, status: 'CLOSED', currency, closedAt: { gte: from, lt: to } },
        select: { id: true, variance: true, closedExpectedCash: true, countedCash: true },
      }),
      this.prisma.paymentOperation.findMany({
        where: { shopId, reconciliationRequired: true },
        select: { id: true, amount: true, currency: true, state: true, provider: true, providerPaymentId: true },
      }),
      this.prisma.complianceRequest.findMany({
        where: {
          shopId,
          OR: [
            { reconciliationRequired: true },
            { state: { in: [ComplianceRequestState.UNKNOWN, ComplianceRequestState.FAILED] } },
          ],
        },
        select: { id: true, documentId: true, adapter: true, operation: true, state: true, errorCode: true, errorMessage: true },
      }),
    ]);

    const settlementTotal = settlements._sum.total ?? ZERO;
    const paymentTotal = payments._sum.amount ?? ZERO;
    const paymentLedgerTotal = paymentLedger._sum.amount ?? ZERO;
    const refundTotal = refunds._sum.amount ?? ZERO;
    const refundLedgerTotal = refundLedger._sum.amount ?? ZERO;
    const totals = {
      settlementTotal: settlementTotal.toFixed(4),
      successfulPaymentTotal: paymentTotal.toFixed(4),
      paymentLedgerTotal: paymentLedgerTotal.toFixed(4),
      successfulRefundTotal: refundTotal.toFixed(4),
      refundLedgerTotal: refundLedgerTotal.toFixed(4),
      closedCashShiftCount: cashSessions.length,
      unresolvedPaymentCount: unresolvedPayments.length,
      unresolvedComplianceRequestCount: complianceRequests.length,
    };

    const run = await this.prisma.financialReconciliationRun.create({
      data: {
        shopId,
        businessDate,
        currency,
        status: FinancialReconciliationStatus.RUNNING,
        totals: totals as Prisma.InputJsonValue,
        correlationId: dto.correlationId,
        startedById: actor.sub,
      },
    });
    const issues: Prisma.FinancialReconciliationIssueCreateManyInput[] = [];
    const addIssue = (issue: Omit<Prisma.FinancialReconciliationIssueCreateManyInput, 'runId' | 'shopId' | 'currency'>) => {
      issues.push({ ...issue, runId: run.id, shopId, currency });
    };

    if (!settlementTotal.eq(paymentTotal)) {
      addIssue({
        type: FinancialReconciliationIssueType.SETTLEMENT_PAYMENT_MISMATCH,
        amount: settlementTotal.sub(paymentTotal).abs(),
        message: 'Paid settlement total does not equal successful payment total for the reconciliation window',
        expected: { settlementTotal: settlementTotal.toFixed(4) },
        actual: { successfulPaymentTotal: paymentTotal.toFixed(4) },
      });
    }
    if (!paymentTotal.eq(paymentLedgerTotal)) {
      addIssue({
        type: FinancialReconciliationIssueType.PAYMENT_LEDGER_MISMATCH,
        amount: paymentTotal.sub(paymentLedgerTotal).abs(),
        message: 'Successful payment total does not equal PAYMENT ledger facts',
        expected: { successfulPaymentTotal: paymentTotal.toFixed(4) },
        actual: { paymentLedgerTotal: paymentLedgerTotal.toFixed(4) },
      });
    }
    if (!refundTotal.eq(refundLedgerTotal.abs())) {
      addIssue({
        type: FinancialReconciliationIssueType.PAYMENT_LEDGER_MISMATCH,
        amount: refundTotal.sub(refundLedgerTotal.abs()).abs(),
        entityType: 'REFUND',
        message: 'Successful provider refund total does not equal REFUND ledger facts',
        expected: { successfulRefundTotal: refundTotal.toFixed(4) },
        actual: { refundLedgerTotal: refundLedgerTotal.toFixed(4) },
      });
    }
    for (const session of cashSessions) {
      const variance = session.variance ?? ZERO;
      if (!variance.eq(0)) {
        addIssue({
          type: FinancialReconciliationIssueType.CASH_SHIFT_MISMATCH,
          amount: variance.abs(),
          entityType: 'CASH_SESSION',
          entityId: session.id,
          message: 'Closed cash shift has a non-zero counted variance',
          expected: { expectedCash: session.closedExpectedCash?.toFixed(4) ?? null },
          actual: { countedCash: session.countedCash?.toFixed(4) ?? null, variance: variance.toFixed(4) },
        });
      }
    }
    for (const payment of unresolvedPayments) {
      addIssue({
        type: FinancialReconciliationIssueType.PAYMENT_REQUIRES_RECONCILIATION,
        amount: payment.amount,
        currency: payment.currency,
        entityType: 'PAYMENT_OPERATION',
        entityId: payment.id,
        message: `Payment ${payment.id} remains ${payment.state} and requires provider reconciliation`,
        actual: { provider: payment.provider, providerPaymentId: payment.providerPaymentId, state: payment.state },
      } as any);
    }
    for (const request of complianceRequests) {
      const isKsef = request.adapter.toLowerCase().includes('ksef');
      addIssue({
        type: isKsef
          ? FinancialReconciliationIssueType.KSEF_REQUIRES_RECONCILIATION
          : FinancialReconciliationIssueType.FISCAL_REQUIRES_RECONCILIATION,
        entityType: 'COMPLIANCE_REQUEST',
        entityId: request.id,
        message: `${request.adapter} ${request.operation} is ${request.state} and requires reconciliation`,
        actual: { documentId: request.documentId, state: request.state, errorCode: request.errorCode, errorMessage: request.errorMessage },
      });
    }

    if (issues.length) await this.prisma.financialReconciliationIssue.createMany({ data: issues });
    const completed = await this.prisma.financialReconciliationRun.update({
      where: { id: run.id },
      data: {
        status: issues.length ? FinancialReconciliationStatus.MISMATCH : FinancialReconciliationStatus.CLEAR,
        mismatchCount: issues.length,
        completedAt: new Date(),
      },
      include: { issues: { orderBy: [{ severity: 'desc' }, { firstSeenAt: 'asc' }] } },
    });
    return this.serializeRun(completed);
  }

  async listOpenReconciliationIssues(actor: JwtAccessPayload) {
    this.assertPermission(actor, PERMISSIONS.REPORT_READ);
    const shopId = requireShopId(actor);
    return this.prisma.financialReconciliationIssue.findMany({
      where: { shopId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      orderBy: [{ severity: 'desc' }, { firstSeenAt: 'asc' }],
      take: 250,
    });
  }

  async getReconciliationRun(actor: JwtAccessPayload, id: string) {
    this.assertPermission(actor, PERMISSIONS.REPORT_READ);
    const shopId = requireShopId(actor);
    const run = await this.prisma.financialReconciliationRun.findFirst({
      where: { id, shopId },
      include: { issues: { orderBy: { firstSeenAt: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Reconciliation run not found');
    return this.serializeRun(run);
  }

  private serializePolicy(policy: any) {
    return {
      ...policy,
      maxSingleAmount: policy.maxSingleAmount.toFixed(4),
      maxCumulativePendingAmount: policy.maxCumulativePendingAmount.toFixed(4),
    };
  }

  private serializeRun(run: any) {
    return {
      ...run,
      issues: (run.issues ?? []).map((issue: any) => ({
        ...issue,
        amount: issue.amount == null ? null : issue.amount.toFixed(4),
      })),
    };
  }
}
