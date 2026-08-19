import { Module } from '@nestjs/common';
import { GrowthModule } from '../growth/growth.module';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';
import { DeterministicInsightProvider, ExternalInsightProvider } from './ai-insights.provider';
import { Phase15OwnerAssistantController } from './phase15-owner-assistant.controller';
import { Phase15OwnerAssistantService } from './phase15-owner-assistant.service';

@Module({
  imports: [GrowthModule],
  controllers: [AiInsightsController, Phase15OwnerAssistantController],
  providers: [
    AiInsightsService,
    DeterministicInsightProvider,
    ExternalInsightProvider,
    Phase15OwnerAssistantService,
  ],
  exports: [AiInsightsService, Phase15OwnerAssistantService],
})
export class AiInsightsModule {}
