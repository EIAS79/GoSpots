import { Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ComplianceProfileService } from './compliance-profile.service';
import { ComplianceService } from './compliance.service';
import {
  AddComplianceProofDto,
  ConfigureComplianceProfileDto,
  CreateComplianceDocumentDto,
  GenerateSettlementComplianceDocumentDto,
  UpsertFiscalDeviceDto,
  UpsertTaxCategoryDto,
} from './dto/compliance.dto';
import { FiscalDocumentService } from './fiscal-document.service';

@ApiTags('compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly profiles: ComplianceProfileService,
    private readonly fiscal: FiscalDocumentService,
  ) {}

  @Get('profile')
  getProfile(@CurrentUser() user: JwtAccessPayload) {
    return this.profiles.getProfile(user);
  }

  @Put('profile')
  configureProfile(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ConfigureComplianceProfileDto,
  ) {
    return this.profiles.configureProfile(user, dto);
  }

  @Get('tax-categories')
  listTaxCategories(@CurrentUser() user: JwtAccessPayload) {
    return this.profiles.listTaxCategories(user);
  }

  @Put('tax-categories')
  upsertTaxCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpsertTaxCategoryDto,
  ) {
    return this.profiles.upsertTaxCategory(user, dto);
  }

  @Get('fiscal-devices')
  listFiscalDevices(@CurrentUser() user: JwtAccessPayload) {
    return this.profiles.listFiscalDevices(user);
  }

  @Put('fiscal-devices')
  upsertFiscalDevice(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpsertFiscalDeviceDto,
  ) {
    return this.profiles.upsertFiscalDevice(user, dto);
  }

  @Post('settlements/:settlementId/documents')
  generateFromSettlement(
    @CurrentUser() user: JwtAccessPayload,
    @Param('settlementId') settlementId: string,
    @Body() dto: GenerateSettlementComplianceDocumentDto,
  ) {
    return this.fiscal.generateFromSettlement(user, settlementId, dto);
  }

  @Get('settlements/:settlementId/status')
  settlementStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('settlementId') settlementId: string,
  ) {
    return this.fiscal.settlementStatus(user, settlementId);
  }

  @Get('reconciliation')
  reconciliation(@CurrentUser() user: JwtAccessPayload) {
    return this.fiscal.reconciliation(user);
  }

  @Post('documents')
  createDocument(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateComplianceDocumentDto) {
    return this.compliance.createDocument(user, dto);
  }

  @Get('documents/:id')
  getDocument(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.compliance.getDocument(user, id);
  }

  @Post('documents/:id/ksef')
  submitKsef(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.compliance.submitKsef(user, id, idempotencyKey);
  }

  @Post('requests/:id/reconcile')
  reconcileKsef(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.compliance.reconcileKsef(user, id);
  }

  @Post('documents/:id/proofs')
  addProof(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: AddComplianceProofDto,
  ) {
    return this.compliance.addProof(user, id, dto);
  }
}
