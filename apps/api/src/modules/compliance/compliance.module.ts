import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { ComplianceProfileService } from './compliance-profile.service';
import { ComplianceSecretCryptoService } from './compliance-secret.crypto';
import { ComplianceService } from './compliance.service';
import { FiscalDocumentService } from './fiscal-document.service';
import { FiscalConnectorRegistry } from './fiscal/fiscal-connector.registry';
import { FiscalizationService } from './fiscal/fiscalization.service';
import { HttpFiscalConnector } from './fiscal/http-fiscal.connector';
import { SimulatedFiscalConnector } from './fiscal/simulated-fiscal.connector';
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
    FiscalizationService,
    FiscalConnectorRegistry,
    SimulatedFiscalConnector,
    HttpFiscalConnector,
    PolandComplianceAdapter,
    Fa3BuilderService,
    KsefCryptoService,
    KsefClientService,
  ],
  exports: [
    ComplianceService,
    ComplianceProfileService,
    FiscalDocumentService,
    FiscalizationService,
    PolandComplianceAdapter,
  ],
})
export class ComplianceModule {}
