import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { ComplianceProfileService } from './compliance-profile.service';
import { ComplianceSecretCryptoService } from './compliance-secret.crypto';
import { ComplianceService } from './compliance.service';
import { FiscalDocumentService } from './fiscal-document.service';
import { Fa3BuilderService } from './ksef/fa3-builder.service';
import { KsefClientService } from './ksef/ksef-client.service';
import { KsefCryptoService } from './ksef/ksef-crypto.service';
import { PolandComplianceAdapter } from './poland-compliance.adapter';

@Module({
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ComplianceProfileService,
    ComplianceSecretCryptoService,
    FiscalDocumentService,
    PolandComplianceAdapter,
    Fa3BuilderService,
    KsefCryptoService,
    KsefClientService,
  ],
  exports: [
    ComplianceService,
    ComplianceProfileService,
    FiscalDocumentService,
    PolandComplianceAdapter,
  ],
})
export class ComplianceModule {}
