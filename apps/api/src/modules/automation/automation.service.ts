import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { safeJsonParse, sha256, stableJson } from '../../common/platform-security.util';
import { withTenantRls } from '../../common/tenant-rls.util';
import { evaluateAutomationCondition, type AutomationCondition } from './automation-evaluator';
import type {
  CreateAutomationRuleDto,
  TriggerAutomationDto,
  UpdateAutomationRuleDto,
} from './dto/automation.dto';

type SafeAction =
  | { type: 'AUDIT'; action?: string; summary?: string }
  | { type: 'WEBHOOK'; endpointId: string; eventType?: string }
  | { type: 'NOOP' };

const MAX_ATTEMPTS = 3;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002',
  );
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private schedulerRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  private shopId(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new BadRequestException('Venue context is required.');
    return actor.shopId;
  }

  private parseActions(raw: string): SafeAction[] {
    return safeJsonParse<SafeAction[]>(raw, []);
  }

  private validateActions(actions: Record<string, unknown>[]): SafeAction[] {
    if (!actions.length) throw new BadRequestException('At least one automation action is required.');
    if (actions.length > 20) throw new BadRequestException('Automation rules are limited to 20 actions.');
    return actions.map((raw, index) => {
      const type = String(raw.type ?? '').toUpperCase();
      if (type === 'NOOP') return { type: 'NOOP' };
      if (type === 'AUDIT') {
        return {
          type: 'AUDIT',
          action: typeof raw.action === 'string' ? raw.action.slice(0, 120) : 'automation.audit',
          summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 240) : 'Automation audit action',
        };
      }
      if (type === 'WEBHOOK') {
        if (typeof raw.endpointId !== 'string' || !raw.endpointId.trim()) {
          throw new BadRequestException(`Action ${index + 1}: endpointId is required for WEBHOOK.`);
        }
        return {
          type: 'WEBHOOK',
          endpointId: raw.endpointId,
          eventType: typeof raw.eventType === 'string' ? raw.eventType.slice(0, 120) : 'automation.triggered',
        };
      }
      throw new BadRequestException(
        `Action ${index + 1}: ${type || 'unknown'} is not allowed. Only AUDIT, WEBHOOK, and NOOP are supported.`,
      );
    });
  }

  async list(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [rules, executions, deadLetters] = await Promise.all([
      this.prisma.automationRule.findMany({ where: { shopId }, orderBy: { updatedAt: 'desc' }, take: 200 }),
      this.prisma.automationExecution.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.automationDeadLetter.findMany({ where: { shopId, resolvedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return {
      rules: rules.map((rule) => ({
        ...rule,
        triggerConfig: safeJsonParse(rule.triggerConfigJson, null),
        condition: safeJsonParse(rule.conditionJson, null),
        actions: this.parseActions(rule.actionsJson),
      })),
      executions,
      deadLetters,
    };
  }

  async createRule(actor: JwtAccessPayload, dto: CreateAutomationRuleDto) {
    const shopId = this.shopId(actor);
    const actions = this.validateActions(dto.actions);
    const nextRunAt = dto.nextRunAt ? new Date(dto.nextRunAt) : null;
    if (nextRunAt && Number.isNaN(nextRunAt.getTime())) throw new BadRequestException('nextRunAt is invalid.');
    if (dto.triggerType === 'SCHEDULED' && !nextRunAt) {
      throw new BadRequestException('Scheduled rules require nextRunAt.');
    }
    return this.prisma.automationRule.create({
      data: {
        shopId,
        name: dto.name.trim(),
        enabled: dto.enabled ?? true,
        triggerType: dto.triggerType,
        triggerConfigJson: dto.triggerConfig ? stableJson(dto.triggerConfig) : null,
        conditionJson: dto.condition ? stableJson(dto.condition) : null,
        actionsJson: stableJson(actions),
        nextRunAt,
        createdById: actor.sub,
      },
    });
  }

  async updateRule(actor: JwtAccessPayload, id: string, dto: UpdateAutomationRuleDto) {
    const shopId = this.shopId(actor);
    const rule = await this.prisma.automationRule.findFirst({ where: { id, shopId } });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    const actions = dto.actions ? this.validateActions(dto.actions) : undefined;
    const nextRunAt = dto.nextRunAt === undefined
      ? undefined
      : dto.nextRunAt === null
        ? null
        : new Date(dto.nextRunAt);
    if (nextRunAt instanceof Date && Number.isNaN(nextRunAt.getTime())) {
      throw new BadRequestException('nextRunAt is invalid.');
    }
    return this.prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        name: dto.name?.trim(),
        enabled: dto.enabled,
        triggerConfigJson: dto.triggerConfig ? stableJson(dto.triggerConfig) : undefined,
        conditionJson: dto.condition ? stableJson(dto.condition) : undefined,
        actionsJson: actions ? stableJson(actions) : undefined,
        nextRunAt,
        version: { increment: 1 },
      },
    });
  }

  async trigger(actor: JwtAccessPayload, ruleId: string, dto: TriggerAutomationDto) {
    const shopId = this.shopId(actor);
    return this.triggerForShop(shopId, actor, ruleId, dto);
  }

  private async triggerForShop(
    shopId: string,
    actor: JwtAccessPayload,
    ruleId: string,
    dto: TriggerAutomationDto,
  ) {
    const existing = await this.prisma.automationExecution.findUnique({
      where: { shopId_dedupeKey: { shopId, dedupeKey: dto.dedupeKey } },
    });
    if (existing) return { execution: existing, replayed: true };

    const rule = await this.prisma.automationRule.findFirst({ where: { id: ruleId, shopId, enabled: true } });
    if (!rule) throw new NotFoundException('Enabled automation rule not found.');
    const payload = dto.payload ?? {};
    const condition = safeJsonParse<AutomationCondition | null>(rule.conditionJson, null);
    const inputHash = sha256(stableJson(payload));
    let execution;
    try {
      execution = await this.prisma.automationExecution.create({
        data: {
          shopId,
          ruleId: rule.id,
          triggerType: rule.triggerType,
          triggerRef: dto.triggerRef ?? null,
          dedupeKey: dto.dedupeKey,
          status: 'QUEUED',
          inputHash,
          inputJson: stableJson(payload),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.automationExecution.findUnique({
          where: { shopId_dedupeKey: { shopId, dedupeKey: dto.dedupeKey } },
        });
        if (replay) return { execution: replay, replayed: true };
      }
      throw error;
    }

    if (!evaluateAutomationCondition(condition, payload)) {
      const skipped = await this.prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'SKIPPED', completedAt: new Date(), outputJson: stableJson({ reason: 'CONDITION_FALSE' }) },
      });
      return { execution: skipped, replayed: false };
    }

    const completed = await this.execute(execution.id, rule, payload, actor);
    return { execution: completed, replayed: false };
  }

  private async execute(
    executionId: string,
    rule: { id: string; shopId: string; actionsJson: string },
    payload: Record<string, unknown>,
    actor: JwtAccessPayload,
  ) {
    const actions = this.parseActions(rule.actionsJson);
    await this.prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', startedAt: new Date(), errorCode: null, errorMessage: null },
    });

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const inputHash = sha256(stableJson({ action, payload }));
      const step = await this.prisma.automationExecutionStep.upsert({
        where: { executionId_stepIndex: { executionId, stepIndex: index } },
        create: {
          shopId: rule.shopId,
          executionId,
          stepIndex: index,
          actionType: action.type,
          status: 'RUNNING',
          inputHash,
          startedAt: new Date(),
        },
        update: {
          status: 'RUNNING',
          inputHash,
          startedAt: new Date(),
          completedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });

      let lastError: unknown;
      let success: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        await this.prisma.automationExecution.update({
          where: { id: executionId },
          data: { attempt },
        });
        try {
          success = await this.executeAction(rule.shopId, executionId, index, action, payload, actor);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        }
      }

      if (lastError) {
        const message = lastError instanceof Error ? lastError.message.slice(0, 500) : 'Automation action failed.';
        await this.prisma.automationExecutionStep.update({
          where: { id: step.id },
          data: { status: 'FAILED', errorCode: 'ACTION_FAILED', errorMessage: message, completedAt: new Date() },
        });
        const failed = await this.prisma.automationExecution.update({
          where: { id: executionId },
          data: { status: 'DEAD_LETTER', errorCode: 'ACTION_FAILED', errorMessage: message, completedAt: new Date() },
        });
        await this.prisma.automationDeadLetter.upsert({
          where: { shopId_executionId: { shopId: rule.shopId, executionId } },
          create: { shopId: rule.shopId, executionId, reason: message },
          update: { reason: message, resolvedAt: null },
        });
        return failed;
      }

      await this.prisma.automationExecutionStep.update({
        where: { id: step.id },
        data: { status: 'SUCCEEDED', outputJson: stableJson(success ?? { ok: true }), completedAt: new Date() },
      });
    }

    const completed = await this.prisma.automationExecution.update({
      where: { id: executionId },
      data: {
        status: 'SUCCEEDED',
        outputJson: stableJson({ actions: actions.length, ok: true }),
        completedAt: new Date(),
      },
    });
    await this.prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastTriggeredAt: new Date() },
    });
    return completed;
  }

  private async executeAction(
    shopId: string,
    executionId: string,
    index: number,
    action: SafeAction,
    payload: Record<string, unknown>,
    actor: JwtAccessPayload,
  ) {
    if (action.type === 'NOOP') return { ok: true };
    if (action.type === 'AUDIT') {
      const row = await this.prisma.auditLog.create({
        data: {
          shopId,
          userId: actor.sub.startsWith('system:') ? null : actor.sub,
          section: 'system',
          action: action.action ?? 'automation.audit',
          summary: action.summary ?? 'Automation audit action',
          meta: stableJson({ executionId, inputHash: sha256(stableJson(payload)) }),
          actorRole: actor.shopRole ?? null,
          actorEmail: actor.sub.startsWith('system:') ? null : actor.email,
          actorName: actor.sub.startsWith('system:') ? 'GoSpots Automation' : null,
        },
      });
      return { auditId: row.id };
    }
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: action.endpointId, shopId, active: true },
    });
    if (!endpoint) throw new NotFoundException('Automation webhook endpoint not found or disabled.');
    const eventId = `automation:${executionId}:${index}`;
    const deliveryPayload = {
      event: action.eventType ?? 'automation.triggered',
      executionId,
      payload,
    };
    const deliveryPayloadJson = JSON.parse(stableJson(deliveryPayload)) as Prisma.InputJsonValue;
    const delivery = await this.prisma.webhookDelivery.upsert({
      where: { endpointId_eventId: { endpointId: endpoint.id, eventId } },
      create: {
        shopId,
        endpointId: endpoint.id,
        eventId,
        eventType: action.eventType ?? 'automation.triggered',
        payload: deliveryPayloadJson,
        payloadHash: sha256(stableJson(deliveryPayloadJson)),
      },
      update: {},
    });
    return { deliveryId: delivery.id, status: delivery.status };
  }

  async replayDeadLetter(actor: JwtAccessPayload, executionId: string) {
    const shopId = this.shopId(actor);
    const dead = await this.prisma.automationDeadLetter.findUnique({
      where: { shopId_executionId: { shopId, executionId } },
    });
    if (!dead || dead.resolvedAt) throw new NotFoundException('Open automation dead letter not found.');
    const execution = await this.prisma.automationExecution.findFirst({ where: { id: executionId, shopId } });
    if (!execution?.ruleId) throw new ConflictException('Execution cannot be replayed.');
    const rule = await this.prisma.automationRule.findFirst({ where: { id: execution.ruleId, shopId } });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    await this.prisma.automationExecution.update({
      where: { id: execution.id },
      data: { status: 'QUEUED', completedAt: null, errorCode: null, errorMessage: null },
    });
    const completed = await this.execute(
      execution.id,
      rule,
      safeJsonParse<Record<string, unknown>>(execution.inputJson, {}),
      actor,
    );
    if (completed.status === 'SUCCEEDED') {
      await this.prisma.automationDeadLetter.update({
        where: { id: dead.id },
        data: { replayCount: { increment: 1 }, lastReplayAt: new Date(), resolvedAt: new Date() },
      });
    } else {
      await this.prisma.automationDeadLetter.update({
        where: { id: dead.id },
        data: { replayCount: { increment: 1 }, lastReplayAt: new Date() },
      });
    }
    return completed;
  }

  async readiness(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [enabled, due, dead] = await Promise.all([
      this.prisma.automationRule.count({ where: { shopId, enabled: true } }),
      this.prisma.automationRule.count({ where: { shopId, enabled: true, triggerType: 'SCHEDULED', nextRunAt: { lte: new Date() } } }),
      this.prisma.automationDeadLetter.count({ where: { shopId, resolvedAt: null } }),
    ]);
    return { status: dead ? 'degraded' : 'ok', enabledRules: enabled, dueRules: due, openDeadLetters: dead, maxAttempts: MAX_ATTEMPTS };
  }

  @Interval(60_000)
  async processScheduledRules() {
    if (this.schedulerRunning) return;
    this.schedulerRunning = true;
    try {
      const due = await this.prisma.automationRule.findMany({
        where: { enabled: true, triggerType: 'SCHEDULED', nextRunAt: { lte: new Date() } },
        orderBy: { nextRunAt: 'asc' },
        take: 50,
      });
      for (const rule of due) {
        await withTenantRls(this.prisma, { shopId: rule.shopId, mode: 'system' }, async () => {
          const actor: JwtAccessPayload = {
            sub: 'system:automation',
            sysRole: 'SYSTEM',
            email: 'automation@gospots.internal',
            shopId: rule.shopId,
            shopRole: 'SYSTEM',
            perms: '*',
          };
          const minuteBucket = Math.floor(Date.now() / 60_000);
          try {
            await this.triggerForShop(rule.shopId, actor, rule.id, {
              dedupeKey: `schedule:${rule.id}:${minuteBucket}`,
              triggerRef: `schedule:${minuteBucket}`,
              payload: { scheduledAt: new Date().toISOString() },
            });
            const cfg = safeJsonParse<{ intervalMinutes?: number }>(rule.triggerConfigJson, {});
            const intervalMinutes = Math.max(1, Math.min(cfg.intervalMinutes ?? 60, 43_200));
            await this.prisma.automationRule.update({
              where: { id: rule.id },
              data: { nextRunAt: new Date(Date.now() + intervalMinutes * 60_000) },
            });
          } catch (error) {
            this.logger.error(`Scheduled automation ${rule.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        });
      }
    } finally {
      this.schedulerRunning = false;
    }
  }
}