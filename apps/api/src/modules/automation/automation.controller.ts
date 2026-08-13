import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from '../foundation/feature-flag.guard';
import { RequireFeature } from '../foundation/require-feature.decorator';
import { AutomationService } from './automation.service';
import {
  CreateAutomationRuleDto,
  TriggerAutomationDto,
  UpdateAutomationRuleDto,
} from './dto/automation.dto';

@ApiTags('automation')
@Controller('automation')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeature('automation_v1')
@RequirePermissions(PERMISSIONS.AUTOMATION_MANAGE)
export class AutomationController {
  constructor(
    private readonly automation: AutomationService,
    private readonly prisma: PrismaService,
  ) {}

  private shopId(user: JwtAccessPayload): string {
    if (!user.shopId) {
      throw new BadRequestException('Venue context is required.');
    }
    return user.shopId;
  }

  @Get()
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.automation.list(user);
  }

  @Post('rules')
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateAutomationRuleDto,
  ) {
    return this.automation.createRule(user, dto);
  }

  @Patch('rules/:id')
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.automation.updateRule(user, id, dto);
  }

  @Post('rules/:id/trigger')
  trigger(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: TriggerAutomationDto,
  ) {
    const shopId = this.shopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'automation.trigger',
        key: dto.dedupeKey,
        requestHash: hashIdempotencyRequest({
          ruleId: id,
          triggerRef: dto.triggerRef ?? null,
          payload: dto.payload ?? {},
        }),
      },
      () => this.automation.trigger(user, id, dto),
    );
  }

  @Post('executions/:id/replay')
  replay(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.automation.replayDeadLetter(user, id);
  }

  @Get('readiness')
  readiness(@CurrentUser() user: JwtAccessPayload) {
    return this.automation.readiness(user);
  }
}
