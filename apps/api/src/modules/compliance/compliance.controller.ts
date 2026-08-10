import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ComplianceService } from './compliance.service';
import { AddComplianceProofDto, CreateComplianceDocumentDto } from './dto/compliance.dto';

@ApiTags('compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

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
