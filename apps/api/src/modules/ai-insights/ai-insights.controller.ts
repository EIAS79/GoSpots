import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightFeedbackDto, RunAiInsightsDto } from './dto/ai-insights.dto';

@ApiTags('ai-insights')
@Controller('ai-insights')
@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.AI_INSIGHTS_READ)
export class AiInsightsController {
  constructor(private readonly insights: AiInsightsService) {}

  @Get()
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.insights.list(user);
  }

  @Post('run')
  run(@CurrentUser() user: JwtAccessPayload, @Body() dto: RunAiInsightsDto) {
    return this.insights.run(user, dto);
  }

  @Post(':id/feedback')
  feedback(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: AiInsightFeedbackDto) {
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
