import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
import { AiInsightsService } from './ai-insights.service';
import {
  AiInsightFeedbackDto,
  RunAiInsightsDto,
} from './dto/ai-insights.dto';

@ApiTags('ai-insights')
@Controller('ai-insights')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeature('ai_insights')
@RequirePermissions(PERMISSIONS.AI_INSIGHTS_READ)
export class AiInsightsController {
  constructor(
    private readonly insights: AiInsightsService,
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
    return this.insights.list(user);
  }

  @Post('run')
  run(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: RunAiInsightsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: this.shopId(user),
        scope: 'ai-insights.run',
        // AI runs already dedupe by snapshot/provider/input hash internally. An
        // explicit client key additionally gives callers the shared API replay
        // contract and protects concurrent retries at the HTTP boundary.
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.insights.run(user, dto),
    );
  }

  @Post(':id/feedback')
  feedback(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: AiInsightFeedbackDto,
  ) {
    return this.insights.feedback(user, id, dto);
  }

  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.insights.dismiss(user, id);
  }

  @Get('readiness')
  readiness(@CurrentUser() user: JwtAccessPayload) {
    return this.insights.readiness(user);
  }
}
