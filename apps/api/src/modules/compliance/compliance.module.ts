import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { KsefClientService } from './ksef/ksef-client.service';
import { KsefCryptoService } from './ksef/ksef-crypto.service';
import { PolandComplianceAdapter } from './poland-compliance.adapter';

@Module({
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    PolandComplianceAdapter,
    KsefCryptoService,
    KsefClientService,
  ],
  exports: [ComplianceService, PolandComplianceAdapter],
})
export class ComplianceModule {}
