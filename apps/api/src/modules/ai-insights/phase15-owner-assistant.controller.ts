import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from '../foundation/feature-flag.guard';
import { RequireFeature } from '../foundation/require-feature.decorator';
import { OwnerAssistantQuestionDto } from './dto/owner-assistant.dto';
import { Phase15OwnerAssistantService } from './phase15-owner-assistant.service';

@ApiTags('ai-insights')
@Controller('ai-insights/owner-assistant')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeature('ai_insights')
@RequirePermissions(PERMISSIONS.AI_INSIGHTS_READ)
export class Phase15OwnerAssistantController {
  constructor(private readonly assistant: Phase15OwnerAssistantService) {}

  @Post('ask')
  ask(@CurrentUser() user: JwtAccessPayload, @Body() dto: OwnerAssistantQuestionDto) {
    return this.assistant.ask(user, dto);
  }
}
