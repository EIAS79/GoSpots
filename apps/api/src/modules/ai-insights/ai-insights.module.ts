import { Module } from '@nestjs/common';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';
import { DeterministicInsightProvider, ExternalInsightProvider } from './ai-insights.provider';

@Module({
  controllers: [AiInsightsController],
  providers: [AiInsightsService, DeterministicInsightProvider, ExternalInsightProvider],
  exports: [AiInsightsService],
})
export class AiInsightsModule {}
