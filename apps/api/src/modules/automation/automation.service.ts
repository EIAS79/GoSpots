import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { safeJsonParse } from '../../common/platform-security.util';
import { withTenantRls } from '../../common/tenant-rls.util';
import { CapabilityService } from '../foundation/capability.service';
import { MailOutboxService } from '../mail/mail-outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Phase15AutomationService } from './automation.phase15.service';
import type { CreateAutomationRuleDto, TriggerAutomationDto, UpdateAutomationRuleDto } from './dto/automation.dto';

@Injectable()
export class AutomationService extends Phase15AutomationService {
  private readonly phase15Logger = new Logger(AutomationService.name);
  private phase15SchedulerRunning = false;

  constructor(
    private readonly phase15Prisma: PrismaService,
    notifications: NotificationsService,
    mailOutbox: MailOutboxService,
    private readonly capabilities: CapabilityService,
  ) {
    super(phase15Prisma, notifications, mailOutbox);
  }

  private async assertAutomation(shopId?: string | null) {
    if (!shopId) throw new ForbiddenException('Venue context is required.');
    const capability = await this.capabilities.snapshot(shopId);
    if (!capability.canUseAutomation) {
      throw new ForbiddenException('Automation capability is unavailable for this venue.');
    }
  }

  override async list(actor: JwtAccessPayload) {
    await this.assertAutomation(actor.shopId);
    return super.list(actor);
  }

  override async createRule(actor: JwtAccessPayload, dto: CreateAutomationRuleDto) {
    await this.assertAutomation(actor.shopId);
    return super.createRule(actor, dto);
  }

  override async updateRule(actor: JwtAccessPayload, id: string, dto: UpdateAutomationRuleDto) {
    await this.assertAutomation(actor.shopId);
    return super.updateRule(actor, id, dto);
  }

  override async trigger(actor: JwtAccessPayload, ruleId: string, dto: TriggerAutomationDto) {
    await this.assertAutomation(actor.shopId);
    return super.trigger(actor, ruleId, dto);
  }

  override async replayDeadLetter(actor: JwtAccessPayload, executionId: string) {
    await this.assertAutomation(actor.shopId);
    return super.replayDeadLetter(actor, executionId);
  }

  override async readiness(actor: JwtAccessPayload) {
    await this.assertAutomation(actor.shopId);
    return super.readiness(actor);
  }

  @Interval(60_000)
  async processScheduledRules() {
    if (this.phase15SchedulerRunning) return;
    this.phase15SchedulerRunning = true;
    try {
      const due = await this.phase15Prisma.automationRule.findMany({
        where: { enabled: true, triggerType: 'SCHEDULED', nextRunAt: { lte: new Date() } },
        orderBy: { nextRunAt: 'asc' },
        take: 50,
      });
      for (const rule of due) {
        const capability = await this.capabilities.snapshot(rule.shopId);
        if (!capability.canUseAutomation) continue;
        await withTenantRls(this.phase15Prisma, { shopId: rule.shopId, mode: 'system' }, async () => {
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
            await super.trigger(actor, rule.id, {
              dedupeKey: `schedule:${rule.id}:${minuteBucket}`,
              triggerRef: `schedule:${minuteBucket}`,
              payload: { scheduledAt: new Date().toISOString() },
            });
            const cfg = safeJsonParse<{ intervalMinutes?: number }>(rule.triggerConfigJson, {});
            const intervalMinutes = Math.max(1, Math.min(cfg.intervalMinutes ?? 60, 43_200));
            await this.phase15Prisma.automationRule.update({
              where: { id: rule.id },
              data: { nextRunAt: new Date(Date.now() + intervalMinutes * 60_000), version: { increment: 1 } },
            });
          } catch (error) {
            this.phase15Logger.error(`Scheduled automation ${rule.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        });
      }
    } finally {
      this.phase15SchedulerRunning = false;
    }
  }
}
