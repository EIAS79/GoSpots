import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentOperationState,
  RefundState,
  PaymentWebhookStatus,
  Prisma,
} from '@prisma/client';
import {
  hashIdempotencyRequest,
} from '../../common/idempotency.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import {
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
  toPrismaDecimal,
} from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import type {
  ConnectorPaymentResult,
  ConnectorRefundResult,
} from './connectors/payment-connector';
import {
  normalizePaymentProvider,
  PaymentConnectorRegistry,
} from './connectors/payment-connector.registry';
import { PaymentOperationStateService } from './payment-operation-state.service';

export type StartProviderPaymentInput = {
  provider: string;
  settlementId?: string | null;
  terminalId?: string | null;
  amount: string;
  currency: string;
  metadata?: Record<string, unknown>;
};

export type RefundAllocationInput = {
  paymentAllocationId?: string | null;
  snapshotId?: string | null;
  amount: string;
};

export type CreateProviderRefundInput = {
  amount: string;
  reason?: string | null;
  allocations: RefundAllocationInput[];
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

function requiredKey(raw: string | undefined | null): string {
  const key = String(raw ?? '').trim();
  if (!key) throw new BadRequestException('Idempotency-Key header is required');
  if (key.length > 128) {
    throw new BadRequestException('Idempotency-Key must be at most 128 characters');
  }
  return key;
}

@Injectable()
export class PaymentDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly connectors: PaymentConnectorRegistry,
    private readonly states: PaymentOperationStateService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: string) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission as never)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private async requirePayments(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'payments_v1'))) {
      throw new ForbiddenException('Provider payments are not enabled for this venue');
    }
  }

  private paymentStateFromConnector(result: ConnectorPaymentResult): PaymentOperationState {
    return result.state as PaymentOperationState;
  }

  private serializeOperation(operation: any) {
    return {
      ...operation,
      amount: serializeMoney(operation.amount),
      reconciliationRequired: Boolean(operation.reconciliationRequired),
    };
  }

  async getOperation(actor: JwtAccessPayload, id: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requirePayments(shopId);
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id, shopId },
      include: { refunds: { include: { allocations: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!operation) throw new NotFoundException('Payment operation not found');
    return this.serializeOperation(operation);
  }

  async startPayment(
    actor: JwtAccessPayload,
    input: StartProviderPaymentInput,
    idempotencyKeyRaw: string | undefined | null,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePayments(shopId);
    const provider = normalizePaymentProvider(input.provider);
    const connector = this.connectors.resolve(provider);
    const idempotencyKey = requiredKey(idempotencyKeyRaw);
    const amount = roundMoneyDecimal(input.amount, 4);
    if (amount.lte(0)) throw new BadRequestException('Payment amount must be greater than zero');
    const currency = String(input.currency ?? '').trim().toUpperCase();
    if (!currency) throw new BadRequestException('Payment currency is required');
    const requestHash = hashIdempotencyRequest({
      provider,
      settlementId: input.settlementId ?? null,
      terminalId: input.terminalId ?? null,
      amount: serializeMoney(amount),
      currency,
      metadata: input.metadata ?? null,
    });

    const uniqueWhere = {
      shopId_provider_idempotencyKey: { shopId, provider, idempotencyKey },
    } as const;
    const existing = await this.prisma.paymentOperation.findUnique({ where: uniqueWhere });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key reused with a different payment request');
      }
      return this.serializeOperation(existing);
    }

    let terminalExternalId: string | null = null;
    if (input.terminalId) {
      const terminal = await this.prisma.paymentTerminal.findFirst({
        where: {
          id: input.terminalId,
          shopId,
          provider,
          enabled: true,
          device: { status: 'ACTIVE' },
        },
        select: { externalTerminalId: true },
      });
      if (!terminal) throw new NotFoundException('Active payment terminal not found');
      terminalExternalId = terminal.externalTerminalId;
    }

    let operation: any;
    try {
      operation = await this.prisma.paymentOperation.create({
        data: {
          shopId,
          settlementId: input.settlementId ?? null,
          terminalId: input.terminalId ?? null,
          provider,
          idempotencyKey,
          requestHash,
          state: PaymentOperationState.CREATED,
          amount,
          currency,
          createdById: actor.sub,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.prisma.paymentOperation.findUnique({ where: uniqueWhere });
      if (!replay) throw error;
      if (replay.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key reused with a different payment request');
      }
      return this.serializeOperation(replay);
    }

    this.states.assertTransition(operation.state, PaymentOperationState.PROCESSING);
    operation = await this.prisma.paymentOperation.update({
      where: { id: operation.id },
      data: { state: PaymentOperationState.PROCESSING },
    });

    let result: ConnectorPaymentResult;
    try {
      result = await connector.createPayment({
        operationId: operation.id,
        idempotencyKey,
        amount: serializeMoney(amount),
        currency,
        terminalExternalId,
        metadata: input.metadata,
      });
    } catch (error) {
      result = {
        providerPaymentId: operation.providerPaymentId ?? `unknown:${operation.id}`,
        state: 'UNKNOWN',
        errorCode: 'CONNECTOR_UNCERTAIN',
        errorMessage: error instanceof Error ? error.message : 'Connector outcome is unknown',
      };
    }

    const nextState = this.paymentStateFromConnector(result);
    this.states.assertTransition(PaymentOperationState.PROCESSING, nextState);
    const now = new Date();
    operation = await this.prisma.paymentOperation.update({
      where: { id: operation.id },
      data: {
        providerPaymentId: result.providerPaymentId,
        state: nextState,
        reconciliationRequired: this.states.reconciliationRequired(nextState),
        providerPayload: (result.providerPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        capturedAt: nextState === PaymentOperationState.CAPTURED ? now : null,
        failedAt: nextState === PaymentOperationState.FAILED ? now : null,
        canceledAt: nextState === PaymentOperationState.CANCELED ? now : null,
      },
    });
    return this.serializeOperation(operation);
  }

  async reconcile(actor: JwtAccessPayload, id: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePayments(shopId);
    const operation = await this.prisma.paymentOperation.findFirst({ where: { id, shopId } });
    if (!operation) throw new NotFoundException('Payment operation not found');
    if (operation.state !== PaymentOperationState.UNKNOWN) {
      throw new ConflictException('Only UNKNOWN payment operations require reconciliation');
    }
    if (!operation.providerPaymentId) {
      throw new ConflictException('Provider payment identifier is unavailable for reconciliation');
    }
    const connector = this.connectors.resolve(operation.provider);
    const result = await connector.getPayment({
      providerPaymentId: operation.providerPaymentId,
      operationId: operation.id,
    });
    const nextState = this.paymentStateFromConnector(result);
    this.states.assertTransition(operation.state, nextState, { reconciliation: true });
    const now = new Date();
    const updated = await this.prisma.paymentOperation.update({
      where: { id: operation.id },
      data: {
        state: nextState,
        reconciliationRequired: this.states.reconciliationRequired(nextState),
        providerPayload: (result.providerPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        lastReconciledAt: now,
        capturedAt: nextState === PaymentOperationState.CAPTURED ? now : operation.capturedAt,
        failedAt: nextState === PaymentOperationState.FAILED ? now : operation.failedAt,
        canceledAt: nextState === PaymentOperationState.CANCELED ? now : operation.canceledAt,
      },
    });
    return this.serializeOperation(updated);
  }

  async cancel(actor: JwtAccessPayload, id: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePayments(shopId);
    const operation = await this.prisma.paymentOperation.findFirst({ where: { id, shopId } });
    if (!operation) throw new NotFoundException('Payment operation not found');
    if (!operation.providerPaymentId) throw new ConflictException('Provider payment has not been created');
    this.states.assertTransition(operation.state, PaymentOperationState.CANCELED);
    const result = await this.connectors.resolve(operation.provider).cancelPayment({
      providerPaymentId: operation.providerPaymentId,
      operationId: operation.id,
    });
    const nextState = this.paymentStateFromConnector(result);
    this.states.assertTransition(operation.state, nextState);
    const updated = await this.prisma.paymentOperation.update({
      where: { id: operation.id },
      data: {
        state: nextState,
        reconciliationRequired: this.states.reconciliationRequired(nextState),
        providerPayload: (result.providerPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        canceledAt: nextState === PaymentOperationState.CANCELED ? new Date() : null,
      },
    });
    return this.serializeOperation(updated);
  }

  async createRefund(
    actor: JwtAccessPayload,
    paymentOperationId: string,
    input: CreateProviderRefundInput,
    idempotencyKeyRaw: string | undefined | null,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePayments(shopId);
    const idempotencyKey = requiredKey(idempotencyKeyRaw);
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id: paymentOperationId, shopId },
      include: { refunds: { where: { state: RefundState.SUCCEEDED }, select: { amount: true } } },
    });
    if (!operation) throw new NotFoundException('Payment operation not found');
    if (
      operation.state !== PaymentOperationState.CAPTURED &&
      operation.state !== PaymentOperationState.PARTIALLY_REFUNDED
    ) {
      throw new ConflictException('Only captured payments can be refunded');
    }
    if (!operation.providerPaymentId) throw new ConflictException('Provider payment identifier is missing');

    const amount = roundMoneyDecimal(input.amount, 4);
    if (amount.lte(0)) throw new BadRequestException('Refund amount must be greater than zero');
    if (!input.allocations.length) throw new BadRequestException('Refund allocations are required');
    const normalizedAllocations = input.allocations.map((allocation) => {
      if (!allocation.paymentAllocationId && !allocation.snapshotId) {
        throw new BadRequestException('Each refund allocation needs paymentAllocationId or snapshotId');
      }
      const allocationAmount = roundMoneyDecimal(allocation.amount, 4);
      if (allocationAmount.lte(0)) throw new BadRequestException('Refund allocation amount must be greater than zero');
      return { ...allocation, amount: allocationAmount };
    });
    const allocationTotal = sumMoneyDecimal(...normalizedAllocations.map((row) => row.amount));
    if (!allocationTotal.eq(amount)) {
      throw new BadRequestException('Refund allocation total must equal refund amount');
    }
    const alreadyRefunded = sumMoneyDecimal(...operation.refunds.map((refund) => refund.amount));
    if (alreadyRefunded.add(amount).gt(operation.amount)) {
      throw new BadRequestException('Refund exceeds captured payment amount');
    }

    const requestHash = hashIdempotencyRequest({
      paymentOperationId,
      amount: serializeMoney(amount),
      reason: input.reason ?? null,
      allocations: normalizedAllocations.map((row) => ({
        paymentAllocationId: row.paymentAllocationId ?? null,
        snapshotId: row.snapshotId ?? null,
        amount: serializeMoney(row.amount),
      })),
    });
    const uniqueWhere = {
      shopId_paymentOperationId_idempotencyKey: {
        shopId,
        paymentOperationId,
        idempotencyKey,
      },
    } as const;
    const existing = await this.prisma.refund.findUnique({
      where: uniqueWhere,
      include: { allocations: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key reused with a different refund request');
      }
      return existing;
    }

    const refund = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          shopId,
          paymentOperationId,
          idempotencyKey,
          requestHash,
          state: RefundState.PROCESSING,
          amount,
          currency: operation.currency,
          reason: input.reason?.trim() || null,
          createdById: actor.sub,
        },
      });
      await tx.refundAllocation.createMany({
        data: normalizedAllocations.map((allocation) => ({
          shopId,
          refundId: created.id,
          paymentAllocationId: allocation.paymentAllocationId ?? null,
          snapshotId: allocation.snapshotId ?? null,
          amount: allocation.amount,
        })),
      });
      return created;
    });

    let result: ConnectorRefundResult;
    try {
      result = await this.connectors.resolve(operation.provider).refundPayment({
        refundId: refund.id,
        paymentProviderId: operation.providerPaymentId,
        idempotencyKey,
        amount: serializeMoney(amount),
        currency: operation.currency,
        reason: input.reason,
      });
    } catch (error) {
      result = {
        providerRefundId: `unknown:${refund.id}`,
        state: 'UNKNOWN',
        errorCode: 'CONNECTOR_UNCERTAIN',
        errorMessage: error instanceof Error ? error.message : 'Refund outcome is unknown',
      };
    }

    const refundState = result.state as RefundState;
    const now = new Date();
    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        providerRefundId: result.providerRefundId,
        state: refundState,
        providerPayload: (result.providerPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        succeededAt: refundState === RefundState.SUCCEEDED ? now : null,
        failedAt: refundState === RefundState.FAILED ? now : null,
      },
      include: { allocations: true },
    });

    if (refundState === RefundState.SUCCEEDED) {
      const refundedAfter = alreadyRefunded.add(amount);
      const nextState = refundedAfter.eq(operation.amount)
        ? PaymentOperationState.REFUNDED
        : PaymentOperationState.PARTIALLY_REFUNDED;
      this.states.assertTransition(operation.state, nextState);
      await this.prisma.paymentOperation.update({
        where: { id: operation.id },
        data: { state: nextState },
      });
    }
    return updated;
  }

  async ingestNormalizedWebhook(input: {
    shopId: string;
    provider: string;
    eventId: string;
    eventType?: string | null;
    payloadHash: string;
    paymentOperationId: string;
    state: PaymentOperationState;
  }) {
    const provider = normalizePaymentProvider(input.provider);
    const uniqueWhere = {
      shopId_provider_eventId: {
        shopId: input.shopId,
        provider,
        eventId: input.eventId,
      },
    } as const;
    const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: uniqueWhere });
    if (existing) return { duplicate: true, event: existing };

    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id: input.paymentOperationId, shopId: input.shopId, provider },
    });
    if (!operation) throw new NotFoundException('Payment operation not found');
    this.states.assertTransition(operation.state, input.state, {
      reconciliation: operation.state === PaymentOperationState.UNKNOWN,
    });

    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.paymentWebhookEvent.create({
          data: {
            shopId: input.shopId,
            provider,
            eventId: input.eventId,
            eventType: input.eventType ?? null,
            payloadHash: input.payloadHash,
            paymentOperationId: operation.id,
            status: PaymentWebhookStatus.APPLIED,
            processedAt: new Date(),
          },
        });
        await tx.paymentOperation.update({
          where: { id: operation.id },
          data: {
            state: input.state,
            reconciliationRequired: this.states.reconciliationRequired(input.state),
            lastReconciledAt:
              operation.state === PaymentOperationState.UNKNOWN ? new Date() : operation.lastReconciledAt,
          },
        });
        return created;
      });
      return { duplicate: false, event };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = await this.prisma.paymentWebhookEvent.findUnique({ where: uniqueWhere });
      return { duplicate: true, event: duplicate };
    }
  }
}
