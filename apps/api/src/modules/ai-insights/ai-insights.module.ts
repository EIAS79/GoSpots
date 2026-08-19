import { Module } from '@nestjs/common';
import { GrowthModule } from '../growth/growth.module';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';
import { DeterministicInsightProvider, ExternalInsightProvider } from './ai-insights.provider';
import { Phase15DeterministicInsightsController } from './phase15-deterministic-insights.controller';
import { Phase15DeterministicInsightsService } from './phase15-deterministic-insights.service';
import { Phase15OwnerAssistantController } from './phase15-owner-assistant.controller';
import { Phase15OwnerAssistantService } from './phase15-owner-assistant.service';

@Module({
  imports: [GrowthModule],
  controllers: [AiInsightsController, Phase15OwnerAssistantController, Phase15DeterministicInsightsController],
  providers: [
    AiInsightsService,
    DeterministicInsightProvider,
    ExternalInsightProvider,
    Phase15OwnerAssistantService,
    Phase15DeterministicInsightsService,
  ],
  exports: [AiInsightsService, Phase15OwnerAssistantService, Phase15DeterministicInsightsService],
})
export class AiInsightsModule {}
