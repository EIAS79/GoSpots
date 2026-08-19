import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import { safeJsonParse, sha256, stableJson } from '../../common/platform-security.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { MailOutboxService } from '../mail/mail-outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { evaluateAutomationCondition, type AutomationCondition } from './automation-evaluator';
import { PHASE15_AUTOMATION_TEMPLATES, PHASE15_FORBIDDEN_AUTONOMOUS_ACTIONS, PHASE15_SAFE_ACTION_TYPES } from './automation.phase15.catalog';
import type { CreateAutomationRuleDto, TriggerAutomationDto, UpdateAutomationRuleDto } from './dto/automation.dto';

type SafeAction =
  | { type: 'AUDIT'; action?: string; summary?: string }
  | { type: 'WEBHOOK'; endpointId: string; eventType?: string }
  | { type: 'NOOP' }
  | { type: 'NOTIFICATION' | 'TASK' | 'ATTENTION'; title: string; body: string; href?: string }
  | { type: 'EMAIL'; to: string; subject: string; text: string; html?: string }
  | { type: 'SMS'; endpointId: string; to: string; body: string }
  | { type: 'CUSTOMER_TAG'; customerId: string; tag: string }
  | { type: 'REPORT'; reportKey: string };

const MAX_ATTEMPTS = 3;
const SAFE_TYPES = new Set<string>(PHASE15_SAFE_ACTION_TYPES);
const FORBIDDEN_TYPES = new Set<string>(PHASE15_FORBIDDEN_AUTONOMOUS_ACTIONS);

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');
}
function requiredString(raw: Record<string, unknown>, key: string, index: number, max: number): string {
  const value = raw[key];
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`Action ${index + 1}: ${key} is required.`);
  return value.trim().slice(0, max);
}
function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

@Injectable()
export class Phase15AutomationService {
  constructor(protected readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly mailOutbox: MailOutboxService) {}

  protected shopId(actor: JwtAccessPayload): string {
    if (!actor.shopId) throw new BadRequestException('Venue context is required.');
    return actor.shopId;
  }
  templates() {
    return { templates: PHASE15_AUTOMATION_TEMPLATES, safeActionTypes: [...PHASE15_SAFE_ACTION_TYPES], forbiddenAutonomousActionTypes: [...PHASE15_FORBIDDEN_AUTONOMOUS_ACTIONS], highRiskPolicy: 'HUMAN_APPROVAL_REQUIRED' };
  }
  private parseActions(raw: string): SafeAction[] { return safeJsonParse<SafeAction[]>(raw, []); }
  private validateActions(actions: Record<string, unknown>[]): SafeAction[] {
    if (!actions.length) throw new BadRequestException('At least one automation action is required.');
    if (actions.length > 20) throw new BadRequestException('Automation rules are limited to 20 actions.');
    return actions.map((raw, index) => {
      const type = typeof raw.type === 'string' ? raw.type.toUpperCase() : '';
      if (FORBIDDEN_TYPES.has(type)) throw new BadRequestException(`Action ${index + 1}: ${type} is high risk and cannot execute autonomously. Human approval is required.`);
      if (type === 'NOOP') return { type: 'NOOP' };
      if (type === 'AUDIT') return { type: 'AUDIT', action: typeof raw.action === 'string' ? raw.action.slice(0, 120) : 'automation.audit', summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 240) : 'Automation audit action' };
      if (type === 'WEBHOOK') return { type: 'WEBHOOK', endpointId: requiredString(raw, 'endpointId', index, 180), eventType: typeof raw.eventType === 'string' ? raw.eventType.slice(0, 120) : 'automation.triggered' };
      if (type === 'NOTIFICATION' || type === 'TASK' || type === 'ATTENTION') return { type, title: requiredString(raw, 'title', index, 160), body: requiredString(raw, 'body', index, 800), href: typeof raw.href === 'string' ? raw.href.slice(0, 300) : undefined };
      if (type === 'EMAIL') {
        const text = requiredString(raw, 'text', index, 10_000);
        return { type: 'EMAIL', to: requiredString(raw, 'to', index, 320).toLowerCase(), subject: requiredString(raw, 'subject', index, 240), text, html: typeof raw.html === 'string' ? raw.html.slice(0, 40_000) : `<p>${escapeHtml(text)}</p>` };
      }
      if (type === 'SMS') return { type: 'SMS', endpointId: requiredString(raw, 'endpointId', index, 180), to: requiredString(raw, 'to', index, 80), body: requiredString(raw, 'body', index, 1600) };
      if (type === 'CUSTOMER_TAG') return { type: 'CUSTOMER_TAG', customerId: requiredString(raw, 'customerId', index, 180), tag: requiredString(raw, 'tag', index, 80).toLowerCase().replace(/[^a-z0-9._-]+/g, '-') };
      if (type === 'REPORT') return { type: 'REPORT', reportKey: requiredString(raw, 'reportKey', index, 120) };
      throw new BadRequestException(`Action ${index + 1}: ${type || 'unknown'} is not allowed. Supported actions: AUDIT, WEBHOOK, NOOP, ${[...SAFE_TYPES].join(', ')}.`);
    });
  }

  async list(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [rules, executions, deadLetters] = await Promise.all([
      this.prisma.automationRule.findMany({ where: { shopId }, orderBy: { updatedAt: 'desc' }, take: 200 }),
      this.prisma.automationExecution.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.automationDeadLetter.findMany({ where: { shopId, resolvedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { rules: rules.map((rule) => ({ ...rule, triggerConfig: safeJsonParse(rule.triggerConfigJson, null), condition: safeJsonParse(rule.conditionJson, null), actions: this.parseActions(rule.actionsJson) })), executions, deadLetters, phase15: this.templates() };
  }
  async createRule(actor: JwtAccessPayload, dto: CreateAutomationRuleDto) {
    const shopId = this.shopId(actor);
    const actions = this.validateActions(dto.actions);
    const nextRunAt = dto.nextRunAt ? new Date(dto.nextRunAt) : null;
    if (nextRunAt && Number.isNaN(nextRunAt.getTime())) throw new BadRequestException('nextRunAt is invalid.');
    if (dto.triggerType === 'SCHEDULED' && !nextRunAt) throw new BadRequestException('Scheduled rules require nextRunAt.');
    return this.prisma.automationRule.create({ data: { shopId, name: dto.name.trim(), enabled: dto.enabled ?? true, triggerType: dto.triggerType, triggerConfigJson: dto.triggerConfig ? stableJson(dto.triggerConfig) : null, conditionJson: dto.condition ? stableJson(dto.condition) : null, actionsJson: stableJson(actions), nextRunAt, createdById: actor.sub } });
  }
  async updateRule(actor: JwtAccessPayload, id: string, dto: UpdateAutomationRuleDto) {
    const shopId = this.shopId(actor);
    const rule = await this.prisma.automationRule.findFirst({ where: { id, shopId } });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    assertExpectedVersion(rule.version, dto.expectedVersion, { aggregateType: 'automation_rule', aggregateId: id });
    const actions = dto.actions ? this.validateActions(dto.actions) : undefined;
    const nextRunAt = dto.nextRunAt === undefined ? undefined : dto.nextRunAt === null ? null : new Date(dto.nextRunAt);
    if (nextRunAt instanceof Date && Number.isNaN(nextRunAt.getTime())) throw new BadRequestException('nextRunAt is invalid.');
    const claimed = await this.prisma.automationRule.updateMany({ where: { id, shopId, version: dto.expectedVersion }, data: { name: dto.name?.trim(), enabled: dto.enabled, triggerConfigJson: dto.triggerConfig ? stableJson(dto.triggerConfig) : undefined, conditionJson: dto.condition ? stableJson(dto.condition) : undefined, actionsJson: actions ? stableJson(actions) : undefined, nextRunAt, version: { increment: 1 } } });
    if (claimed.count !== 1) {
      const current = await this.prisma.automationRule.findFirst({ where: { id, shopId }, select: { version: true } });
      assertExpectedVersion(current?.version ?? dto.expectedVersion + 1, dto.expectedVersion, { aggregateType: 'automation_rule', aggregateId: id });
    }
    return this.prisma.automationRule.findFirstOrThrow({ where: { id, shopId } });
  }
  async trigger(actor: JwtAccessPayload, ruleId: string, dto: TriggerAutomationDto) {
    const shopId = this.shopId(actor);
    const existing = await this.prisma.automationExecution.findUnique({ where: { shopId_dedupeKey: { shopId, dedupeKey: dto.dedupeKey } } });
    if (existing) return { execution: existing, replayed: true };
    const rule = await this.prisma.automationRule.findFirst({ where: { id: ruleId, shopId, enabled: true } });
    if (!rule) throw new NotFoundException('Enabled automation rule not found.');
    const payload = dto.payload ?? {};
    let execution;
    try {
      execution = await this.prisma.automationExecution.create({ data: { shopId, ruleId, triggerType: rule.triggerType, triggerRef: dto.triggerRef ?? null, dedupeKey: dto.dedupeKey, status: 'QUEUED', inputHash: sha256(stableJson(payload)), inputJson: stableJson(payload) } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.automationExecution.findUnique({ where: { shopId_dedupeKey: { shopId, dedupeKey: dto.dedupeKey } } });
        if (replay) return { execution: replay, replayed: true };
      }
      throw error;
    }
    const condition = safeJsonParse<AutomationCondition | null>(rule.conditionJson, null);
    if (!evaluateAutomationCondition(condition, payload)) {
      const skipped = await this.prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', completedAt: new Date(), outputJson: stableJson({ reason: 'CONDITION_FALSE' }) } });
      return { execution: skipped, replayed: false };
    }
    return { execution: await this.execute(execution.id, rule, payload, actor), replayed: false };
  }
  private async execute(executionId: string, rule: { id: string; shopId: string; actionsJson: string }, payload: Record<string, unknown>, actor: JwtAccessPayload) {
    const actions = this.parseActions(rule.actionsJson);
    await this.prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'RUNNING', startedAt: new Date(), errorCode: null, errorMessage: null } });
    for (const [index, action] of actions.entries()) {
      const step = await this.prisma.automationExecutionStep.upsert({ where: { executionId_stepIndex: { executionId, stepIndex: index } }, create: { shopId: rule.shopId, executionId, stepIndex: index, actionType: action.type, status: 'RUNNING', inputHash: sha256(stableJson({ action, payload })), startedAt: new Date() }, update: { status: 'RUNNING', startedAt: new Date(), completedAt: null, errorCode: null, errorMessage: null } });
      let result: unknown;
      let failure: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        await this.prisma.automationExecution.update({ where: { id: executionId }, data: { attempt } });
        try { result = await this.executeAction(rule.shopId, executionId, index, action, payload, actor); failure = undefined; break; } catch (error) { failure = error; }
      }
      if (failure) {
        const message = failure instanceof Error ? failure.message.slice(0, 500) : 'Automation action failed.';
        await this.prisma.automationExecutionStep.update({ where: { id: step.id }, data: { status: 'FAILED', errorCode: 'ACTION_FAILED', errorMessage: message, completedAt: new Date() } });
        const failed = await this.prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'DEAD_LETTER', errorCode: 'ACTION_FAILED', errorMessage: message, completedAt: new Date() } });
        await this.prisma.automationDeadLetter.upsert({ where: { shopId_executionId: { shopId: rule.shopId, executionId } }, create: { shopId: rule.shopId, executionId, reason: message }, update: { reason: message, resolvedAt: null } });
        return failed;
      }
      await this.prisma.automationExecutionStep.update({ where: { id: step.id }, data: { status: 'SUCCEEDED', outputJson: stableJson(result ?? { ok: true }), completedAt: new Date() } });
    }
    const completed = await this.prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'SUCCEEDED', outputJson: stableJson({ actions: actions.length, ok: true }), completedAt: new Date() } });
    await this.prisma.automationRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: new Date(), version: { increment: 1 } } });
    return completed;
  }
  private async webhook(shopId: string, executionId: string, index: number, endpointId: string, eventType: string, payload: Record<string, unknown>) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, shopId, active: true } });
    if (!endpoint) throw new NotFoundException('Automation webhook endpoint not found or disabled.');
    const eventId = `automation:${executionId}:${index}`;
    const body = { event: eventType, executionId, payload };
    const json = JSON.parse(stableJson(body)) as Prisma.InputJsonValue;
    const delivery = await this.prisma.webhookDelivery.upsert({ where: { endpointId_eventId: { endpointId, eventId } }, create: { shopId, endpointId, eventId, eventType, payload: json, payloadHash: sha256(stableJson(json)) }, update: {} });
    return { deliveryId: delivery.id, status: delivery.status };
  }
  private async executeAction(shopId: string, executionId: string, index: number, action: SafeAction, payload: Record<string, unknown>, actor: JwtAccessPayload): Promise<unknown> {
    const key = `automation:${executionId}:${index}`;
    if (action.type === 'NOOP') return { ok: true };
    if (action.type === 'WEBHOOK') return this.webhook(shopId, executionId, index, action.endpointId, action.eventType ?? 'automation.triggered', payload);
    if (action.type === 'AUDIT') {
      const row = await this.prisma.auditLog.create({ data: { shopId, userId: actor.sub.startsWith('system:') ? null : actor.sub, section: 'system', action: action.action ?? 'automation.audit', summary: action.summary ?? 'Automation audit action', meta: stableJson({ executionId, inputHash: sha256(stableJson(payload)) }), actorRole: actor.shopRole ?? null, actorEmail: actor.sub.startsWith('system:') ? null : actor.email, actorName: actor.sub.startsWith('system:') ? 'GoSpots Automation' : null } });
      return { auditId: row.id };
    }
    if (action.type === 'NOTIFICATION' || action.type === 'TASK' || action.type === 'ATTENTION') {
      const prefix = action.type === 'TASK' ? '[Task] ' : action.type === 'ATTENTION' ? '[Attention] ' : '';
      const row = await this.notifications.recordOperationsEvent(shopId, { title: `${prefix}${action.title}`, body: action.body, href: action.href, dedupeKey: key });
      return { notificationId: row?.id ?? null, kind: action.type };
    }
    if (action.type === 'EMAIL') {
      const row = await this.mailOutbox.enqueue({ shopId, to: action.to, subject: action.subject, text: action.text, html: action.html ?? `<p>${escapeHtml(action.text)}</p>`, idempotencyKey: key });
      return { outboxId: row.id };
    }
    if (action.type === 'SMS') return this.webhook(shopId, executionId, index, action.endpointId, 'automation.sms.requested', { to: action.to, body: action.body, sourcePayloadHash: sha256(stableJson(payload)) });
    if (action.type === 'CUSTOMER_TAG') {
      const customer = await this.prisma.customerProfile.findFirst({ where: { id: action.customerId, shopId }, select: { id: true } });
      if (!customer) throw new NotFoundException('Automation customer not found in this venue.');
      const row = await this.prisma.customerPreference.upsert({ where: { shopId_customerId_key: { shopId, customerId: customer.id, key: `tag:${action.tag}` } }, create: { shopId, customerId: customer.id, key: `tag:${action.tag}`, value: { tagged: true, source: 'AUTOMATION', executionId } as Prisma.InputJsonValue, updatedById: actor.sub.startsWith('system:') ? null : actor.sub }, update: { value: { tagged: true, source: 'AUTOMATION', executionId } as Prisma.InputJsonValue, updatedById: actor.sub.startsWith('system:') ? null : actor.sub, version: { increment: 1 } } });
      return { preferenceId: row.id, tag: action.tag };
    }
    if (action.type === 'REPORT') return { reportKey: action.reportKey, executionId, source: 'AUTOMATION_PAYLOAD', payloadHash: sha256(stableJson(payload)), facts: payload, limitations: ['Report contains only facts supplied to this automation execution.'] };
    throw new BadRequestException('Unsupported automation action.');
  }
  async replayDeadLetter(actor: JwtAccessPayload, executionId: string) {
    const shopId = this.shopId(actor);
    const dead = await this.prisma.automationDeadLetter.findUnique({ where: { shopId_executionId: { shopId, executionId } } });
    if (!dead || dead.resolvedAt) throw new NotFoundException('Open automation dead letter not found.');
    const execution = await this.prisma.automationExecution.findFirst({ where: { id: executionId, shopId } });
    if (!execution?.ruleId) throw new ConflictException('Execution cannot be replayed.');
    const rule = await this.prisma.automationRule.findFirst({ where: { id: execution.ruleId, shopId } });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    await this.prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'QUEUED', completedAt: null, errorCode: null, errorMessage: null } });
    const completed = await this.execute(execution.id, rule, safeJsonParse<Record<string, unknown>>(execution.inputJson, {}), actor);
    await this.prisma.automationDeadLetter.update({ where: { id: dead.id }, data: { replayCount: { increment: 1 }, lastReplayAt: new Date(), resolvedAt: completed.status === 'SUCCEEDED' ? new Date() : null } });
    return completed;
  }
  async readiness(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [enabled, due, dead] = await Promise.all([
      this.prisma.automationRule.count({ where: { shopId, enabled: true } }),
      this.prisma.automationRule.count({ where: { shopId, enabled: true, triggerType: 'SCHEDULED', nextRunAt: { lte: new Date() } } }),
      this.prisma.automationDeadLetter.count({ where: { shopId, resolvedAt: null } }),
    ]);
    return { status: dead ? 'degraded' : 'ok', enabledRules: enabled, dueRules: due, openDeadLetters: dead, maxAttempts: MAX_ATTEMPTS, safeActionTypes: [...PHASE15_SAFE_ACTION_TYPES], forbiddenAutonomousActionTypes: [...PHASE15_FORBIDDEN_AUTONOMOUS_ACTIONS], templates: PHASE15_AUTOMATION_TEMPLATES.length };
  }
}
