import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplianceDocumentKind,
  ComplianceDocumentState,
  ComplianceProofType,
  ComplianceRequestState,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { hasPermission, PERMISSIONS } from '../../../common/permissions';
import { requireShopId } from '../../../common/tenant';
import { PrismaService } from '../../../prisma/prisma.service';
import type { JwtAccessPayload } from '../../auth/auth.service';
import { FeatureFlagService } from '../../foundation/feature-flag.service';
import type { FiscalizeReceiptDto } from '../dto/compliance.dto';
import { FiscalConnectorRegistry } from './fiscal-connector.registry';
import type { FiscalConnectorResult } from './fiscal-connector';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requiredKey(value?: string): string {
  const key = String(value ?? '').trim();
  if (!key) throw new BadRequestException('Idempotency-Key header is required');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key must be at most 128 characters');
  return key;
}

@Injectable()
export class FiscalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly connectors: FiscalConnectorRegistry,
  ) {}

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_WRITE)) return;
    throw new ForbiddenException('Missing transaction.write permission');
  }

  private async requireEnabled(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'fiscal_pl'))) {
      throw new ForbiddenException('Poland fiscal compliance is not enabled for this venue');
    }
  }

  private async document(shopId: string, id: string) {
    const document = await this.prisma.complianceDocument.findFirst({
      where: { id, shopId },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!document) throw new NotFoundException('Compliance document not found');
    if (document.kind !== ComplianceDocumentKind.RECEIPT) {
      throw new BadRequestException('Only RECEIPT documents use fiscal-device fiscalization');
    }
    if (!document.documentNumber) throw new ConflictException('Receipt document has no document number');
    return document;
  }

  private async device(shopId: string, id: string) {
    const device = await this.prisma.fiscalDevice.findFirst({ where: { id, shopId, enabled: true } });
    if (!device) throw new NotFoundException('Enabled fiscal device not found');
    if (!device.externalDeviceId) throw new ConflictException('Fiscal device has no external device id');
    return device;
  }

  private async persistResult(
    shopId: string,
    requestId: string,
    documentId: string,
    result: FiscalConnectorResult,
    attemptIncrement: boolean,
  ) {
    const state =
      result.state === 'ACCEPTED'
        ? ComplianceRequestState.SUCCEEDED
        : result.state === 'REJECTED'
          ? ComplianceRequestState.FAILED
          : result.state === 'UNKNOWN'
            ? ComplianceRequestState.UNKNOWN
            : ComplianceRequestState.SUBMITTED;
    const docState =
      result.state === 'ACCEPTED'
        ? ComplianceDocumentState.ACCEPTED
        : result.state === 'REJECTED'
          ? ComplianceDocumentState.REJECTED
          : result.state === 'UNKNOWN'
            ? ComplianceDocumentState.UNKNOWN
            : ComplianceDocumentState.SUBMITTED;
    const responseHash = sha256(JSON.stringify(result));

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.complianceRequest.update({
        where: { id: requestId },
        data: {
          state,
          externalReference: 'externalReference' in result ? result.externalReference ?? null : null,
          responseHash,
          reconciliationRequired: result.state === 'PENDING' || result.state === 'UNKNOWN',
          ...(attemptIncrement ? { attemptCount: { increment: 1 }, lastAttemptAt: new Date() } : {}),
          errorCode: result.state === 'REJECTED' || result.state === 'UNKNOWN' ? result.errorCode : null,
          errorMessage: result.state === 'REJECTED' || result.state === 'UNKNOWN' ? result.errorMessage.slice(0, 500) : null,
        },
      });
      await tx.complianceDocument.update({
        where: { id: documentId },
        data: {
          state: docState,
          externalSystem: 'PL_FISCAL',
          externalReference: 'externalReference' in result ? result.externalReference ?? null : null,
          ...(result.state === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
          ...(result.state === 'REJECTED' ? { rejectedAt: new Date() } : {}),
        },
      });
      if (result.state === 'ACCEPTED') {
        await tx.complianceProof.upsert({
          where: {
            shopId_documentId_type_contentHash: {
              shopId,
              documentId,
              type: ComplianceProofType.FISCAL_RECEIPT,
              contentHash: sha256(result.proof),
            },
          },
          create: {
            shopId,
            documentId,
            type: ComplianceProofType.FISCAL_RECEIPT,
            externalReference: result.fiscalNumber,
            contentHash: sha256(result.proof),
            content: result.proof,
            metadata: {
              fiscalNumber: result.fiscalNumber,
              externalReference: result.externalReference,
            },
          },
          update: {},
        });
      }
      await tx.complianceEvent.create({
        data: {
          shopId,
          documentId,
          eventType: `compliance.fiscal.${result.state.toLowerCase()}`,
          payloadHash: responseHash,
          payload: {
            requestId,
            externalReference: 'externalReference' in result ? result.externalReference ?? null : null,
          },
        },
      });
      return request;
    });
  }

  async submitReceipt(
    actor: JwtAccessPayload,
    documentId: string,
    dto: FiscalizeReceiptDto,
    idempotencyKeyRaw?: string,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await this.requireEnabled(shopId);
    const key = requiredKey(idempotencyKeyRaw);
    const document = await this.document(shopId, documentId);
    const device = await this.device(shopId, dto.fiscalDeviceId);
    const adapter = `PL_FISCAL:${device.provider.trim().toUpperCase()}`;

    const existing = await this.prisma.complianceRequest.findUnique({
      where: {
        documentId_adapter_operation: {
          documentId,
          adapter,
          operation: 'SUBMIT_RECEIPT',
        },
      },
    });
    if (existing) {
      if (existing.state === ComplianceRequestState.UNKNOWN) {
        throw new ConflictException('Fiscal outcome is unknown. Reconcile the existing request; do not fiscalize again.');
      }
      return existing;
    }

    const requestHash = sha256(`${document.id}|${document.payloadHash}|${device.id}|SUBMIT_RECEIPT`);
    const keyExisting = await this.prisma.complianceRequest.findUnique({
      where: { shopId_adapter_idempotencyKey: { shopId, adapter, idempotencyKey: key } },
    });
    if (keyExisting) {
      if (keyExisting.documentId !== documentId || keyExisting.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key was already used for another fiscal request');
      }
      return keyExisting;
    }

    let request;
    try {
      request = await this.prisma.complianceRequest.create({
        data: {
          shopId,
          documentId,
          adapter,
          operation: 'SUBMIT_RECEIPT',
          idempotencyKey: key,
          requestHash,
          state: ComplianceRequestState.SENDING,
          attemptCount: 1,
          lastAttemptAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.complianceRequest.findFirst({
          where: { documentId, adapter, operation: 'SUBMIT_RECEIPT' },
        });
        if (raced) return raced;
      }
      throw error;
    }

    const documentNumber = document.documentNumber;
    const externalDeviceId = device.externalDeviceId;
    if (!documentNumber) {
      throw new ConflictException('Receipt document has no document number');
    }
    if (!externalDeviceId) {
      throw new ConflictException('Fiscal device has no external device id');
    }

    const connector = this.connectors.get(device.provider);
    const result = await connector.submit({
      documentId: document.id,
      documentNumber,
      externalDeviceId,
      currency: document.currency,
      grossAmount: document.grossAmount.toString(),
      lines: document.lines.map((line) => ({
        position: line.position,
        description: line.description,
        quantity: line.quantity.toString(),
        taxCategoryCode: line.taxCategoryCode,
        taxRatePercent: line.taxRatePercent.toString(),
        grossAmount: line.grossAmount.toString(),
      })),
      idempotencyKey: requestHash,
    });
    return this.persistResult(shopId, request.id, documentId, result, false);
  }

  async reconcileReceipt(actor: JwtAccessPayload, requestId: string) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await this.requireEnabled(shopId);
    const request = await this.prisma.complianceRequest.findFirst({
      where: { id: requestId, shopId, operation: 'SUBMIT_RECEIPT', adapter: { startsWith: 'PL_FISCAL:' } },
    });
    if (!request) throw new NotFoundException('Fiscal request not found');
    if (request.state === ComplianceRequestState.SUCCEEDED || request.state === ComplianceRequestState.FAILED) {
      return request;
    }
    if (!request.externalReference) {
      throw new ConflictException('Fiscal request has no external reference. Do not resubmit automatically; operator review is required.');
    }
    const provider = request.adapter.slice('PL_FISCAL:'.length);
    const result = await this.connectors.get(provider).status(request.externalReference);
    return this.persistResult(shopId, request.id, request.documentId, result, true);
  }
}
