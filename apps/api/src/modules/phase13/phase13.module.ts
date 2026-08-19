import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { Phase13Controller } from './phase13.controller';
import { Phase13Service } from './phase13.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [Phase13Controller],
  providers: [Phase13Service],
  exports: [Phase13Service],
})
export class Phase13Module {}
