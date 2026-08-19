import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from '../foundation/feature-flag.guard';
import { RequireFeature } from '../foundation/require-feature.decorator';
import { DeterministicInsightsDto } from './dto/deterministic-insights.dto';
import { Phase15DeterministicInsightsService } from './phase15-deterministic-insights.service';

@ApiTags('ai-insights')
@Controller('ai-insights/deterministic')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeature('ai_insights')
@RequirePermissions(PERMISSIONS.AI_INSIGHTS_READ)
export class Phase15DeterministicInsightsController {
  constructor(private readonly insights: Phase15DeterministicInsightsService) {}

  @Post()
  generate(@CurrentUser() user: JwtAccessPayload, @Body() dto: DeterministicInsightsDto) {
    return this.insights.generate(user, dto);
  }
}
