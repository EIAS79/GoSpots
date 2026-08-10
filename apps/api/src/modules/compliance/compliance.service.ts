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
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { toPrismaDecimal } from '../../common/money.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import type { AddComplianceProofDto, CreateComplianceDocumentDto } from './dto/compliance.dto';
import { KsefClientService } from './ksef/ksef-client.service';
import { KsefCryptoService } from './ksef/ksef-crypto.service';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requiredKey(value?: string): string {
  const key = String(value ?? '').trim();
  if (!key) throw new BadRequestException('Idempotency-Key header is required');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key must be at most 128 characters');
  return key;
}

function externalRefs(value: string | null): { session: string; invoice: string } | null {
  if (!value) return null;
  const parsed = value.split('|');
  if (parsed.length !== 2 || !parsed[0] || !parsed[1]) return null;
  return { session: parsed[0], invoice: parsed[1] };
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly ksef: KsefClientService,
    private readonly crypto: KsefCryptoService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: string) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission as never)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private async requirePoland(shopId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { country: true } });
    const country = shop?.country?.trim().toUpperCase();
    if (country !== 'PL' && country !== 'POLAND' && country !== 'POLSKA') {
      throw new ForbiddenException('Poland compliance adapter is not applicable to this venue');
    }
    if (!(await this.flags.isFeatureEnabled(shopId, 'fiscal_pl'))) {
      throw new ForbiddenException('Poland fiscal compliance is not enabled for this venue');
    }
  }

  private money(dto: CreateComplianceDocumentDto) {
    const net = toPrismaDecimal(dto.netAmount);
    const tax = toPrismaDecimal(dto.taxAmount);
    const gross = toPrismaDecimal(dto.grossAmount);
    if (net.isNegative() || tax.isNegative() || gross.isNegative()) {
      throw new BadRequestException('Compliance amounts cannot be negative');
    }
    if (!net.add(tax).equals(gross)) {
      throw new BadRequestException('grossAmount must equal netAmount + taxAmount exactly');
    }
    return { net, tax, gross };
  }

  async createDocument(actor: JwtAccessPayload, dto: CreateComplianceDocumentDto) {
    this.assertPermission(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePoland(shopId);
    const amount = this.money(dto);
    const payloadHash = sha256(dto.payloadXml ?? JSON.stringify({
      kind: dto.kind,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      sourceVersion: dto.sourceVersion ?? 1,
      issueDate: dto.issueDate,
      currency: dto.currency,
      netAmount: dto.netAmount,
      taxAmount: dto.taxAmount,
      grossAmount: dto.grossAmount,
      taxSummary: dto.taxSummary ?? null,
    }));

    if (dto.parentDocumentId) {
      const parent = await this.prisma.complianceDocument.findFirst({
        where: { id: dto.parentDocumentId, shopId },
        select: { id: true, state: true },
      });
      if (!parent) throw new NotFoundException('Parent compliance document not found');
      if (dto.kind !== 'CORRECTION' && dto.kind !== 'REFUND') {
        throw new BadRequestException('Only correction/refund documents may reference a parent');
      }
    }

    try {
      return await this.prisma.complianceDocument.create({
        data: {
          shopId,
          jurisdiction: 'PL',
          kind: dto.kind as ComplianceDocumentKind,
          state: ComplianceDocumentState.DRAFT,
          sourceType: dto.sourceType.trim(),
          sourceId: dto.sourceId.trim(),
          sourceVersion: dto.sourceVersion ?? 1,
          parentDocumentId: dto.parentDocumentId || null,
          documentNumber: dto.documentNumber?.trim() || null,
          issueDate: new Date(dto.issueDate),
          currency: dto.currency.trim().toUpperCase(),
          netAmount: amount.net,
          taxAmount: amount.tax,
          grossAmount: amount.gross,
          taxSummary: (dto.taxSummary ?? undefined) as Prisma.InputJsonValue | undefined,
          payloadHash,
          payloadXml: dto.payloadXml ?? null,
          createdById: actor.sub,
          events: {
            create: {
              shopId,
              eventType: 'compliance.document.created',
              payloadHash,
              payload: { sourceType: dto.sourceType, sourceId: dto.sourceId, kind: dto.kind },
            },
          },
        },
        include: { proofs: true, requests: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.complianceDocument.findFirst({
          where: {
            shopId,
            jurisdiction: 'PL',
            kind: dto.kind as ComplianceDocumentKind,
            sourceType: dto.sourceType.trim(),
            sourceId: dto.sourceId.trim(),
            sourceVersion: dto.sourceVersion ?? 1,
          },
          include: { proofs: true, requests: true },
        });
        if (existing?.payloadHash === payloadHash) return existing;
        throw new ConflictException('Compliance source/version already exists with different content');
      }
      throw error;
    }
  }

  async getDocument(actor: JwtAccessPayload, id: string) {
    this.assertPermission(actor, PERMISSIONS.TRANSACTION_READ);
    const shopId = requireShopId(actor);
    const doc = await this.prisma.complianceDocument.findFirst({
      where: { id, shopId },
      include: {
        requests: { orderBy: { createdAt: 'asc' } },
        proofs: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        childDocuments: { select: { id: true, kind: true, state: true, documentNumber: true, createdAt: true } },
      },
    });
    if (!doc) throw new NotFoundException('Compliance document not found');
    return doc;
  }

  async submitKsef(actor: JwtAccessPayload, id: string, idempotencyKeyRaw?: string) {
    this.assertPermission(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePoland(shopId);
    if (!(await this.flags.isFeatureEnabled(shopId, 'ksef_pl'))) {
      throw new ForbiddenException('KSeF is not enabled for this venue');
    }
    if (!this.ksef.isEnabled()) {
      throw new ForbiddenException('Live KSeF integration is disabled by environment configuration');
    }
    const key = requiredKey(idempotencyKeyRaw);
    const doc = await this.prisma.complianceDocument.findFirst({ where: { id, shopId } });
    if (!doc) throw new NotFoundException('Compliance document not found');
    if (doc.kind === ComplianceDocumentKind.RECEIPT) {
      throw new BadRequestException('Receipt fiscalization is not a KSeF invoice submission');
    }
    if (!doc.payloadXml?.trim()) throw new BadRequestException('KSeF invoice XML snapshot is required');

    const requestHash = sha256(`${doc.id}|${doc.payloadHash}|${key}`);
    const existing = await this.prisma.complianceRequest.findUnique({
      where: { shopId_adapter_idempotencyKey: { shopId, adapter: 'PL_KSEF', idempotencyKey: key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash || existing.documentId !== doc.id) {
        throw new ConflictException('Idempotency key was already used for a different KSeF request');
      }
      return existing;
    }

    const request = await this.prisma.complianceRequest.create({
      data: {
        shopId,
        documentId: doc.id,
        adapter: 'PL_KSEF',
        operation: 'SUBMIT_INVOICE',
        idempotencyKey: key,
        requestHash,
        state: ComplianceRequestState.SENDING,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      },
    });

    const result = await this.ksef.submitOnlineInvoice(doc.payloadXml);
    if (result.state === 'UNKNOWN') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.complianceRequest.update({
          where: { id: request.id },
          data: {
            state: ComplianceRequestState.UNKNOWN,
            externalReference: result.sessionReference && result.invoiceReference
              ? `${result.sessionReference}|${result.invoiceReference}` : null,
            reconciliationRequired: true,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        });
        await tx.complianceDocument.update({ where: { id: doc.id }, data: { state: ComplianceDocumentState.UNKNOWN } });
        await tx.complianceEvent.create({
          data: {
            shopId,
            documentId: doc.id,
            eventType: 'compliance.ksef.unknown',
            payloadHash: sha256(result.errorMessage),
            payload: { requestId: request.id, errorCode: result.errorCode },
          },
        });
        return updated;
      });
    }

    const ref = `${result.sessionReference}|${result.invoiceReference}`;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.complianceRequest.update({
        where: { id: request.id },
        data: {
          state: ComplianceRequestState.SUBMITTED,
          externalReference: ref,
          responseHash: sha256(JSON.stringify(result.response)),
          reconciliationRequired: true,
        },
      });
      await tx.complianceDocument.update({
        where: { id: doc.id },
        data: { state: ComplianceDocumentState.SUBMITTED, externalSystem: 'KSEF', externalReference: result.invoiceReference },
      });
      await tx.complianceProof.create({
        data: {
          shopId,
          documentId: doc.id,
          type: ComplianceProofType.KSEF_REFERENCE,
          externalReference: result.invoiceReference,
          contentHash: sha256(ref),
          content: ref,
        },
      });
      await tx.complianceEvent.create({
        data: { shopId, documentId: doc.id, eventType: 'compliance.ksef.submitted', payloadHash: sha256(ref), payload: { requestId: request.id } },
      });
      return updated;
    });
  }

  async reconcileKsef(actor: JwtAccessPayload, requestId: string) {
    this.assertPermission(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePoland(shopId);
    const request = await this.prisma.complianceRequest.findFirst({ where: { id: requestId, shopId, adapter: 'PL_KSEF' } });
    if (!request) throw new NotFoundException('KSeF compliance request not found');
    const refs = externalRefs(request.externalReference);
    if (!refs) throw new ConflictException('KSeF request has no definite session/invoice reference to reconcile');

    try {
      const status = await this.ksef.getInvoiceStatus(refs.session, refs.invoice) as Record<string, unknown>;
      const statusValue = status.status && typeof status.status === 'object' ? status.status as Record<string, unknown> : {};
      const code = typeof statusValue.code === 'number' ? statusValue.code : null;
      const ksefNumber = typeof status.ksefNumber === 'string' ? status.ksefNumber : null;
      const accepted = Boolean(ksefNumber) || (code !== null && code >= 200 && code < 300);
      const rejected = code !== null && code >= 400;
      const responseHash = sha256(JSON.stringify(status));

      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.complianceRequest.update({
          where: { id: request.id },
          data: {
            state: accepted ? ComplianceRequestState.SUCCEEDED : rejected ? ComplianceRequestState.FAILED : ComplianceRequestState.SUBMITTED,
            reconciliationRequired: !accepted && !rejected,
            responseHash,
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date(),
            errorCode: rejected ? `KSEF_${code}` : null,
          },
        });
        await tx.complianceDocument.update({
          where: { id: request.documentId },
          data: {
            state: accepted ? ComplianceDocumentState.ACCEPTED : rejected ? ComplianceDocumentState.REJECTED : ComplianceDocumentState.SUBMITTED,
            ...(accepted ? { acceptedAt: new Date(), ksefNumber } : {}),
            ...(rejected ? { rejectedAt: new Date() } : {}),
          },
        });
        if (ksefNumber) {
          await tx.complianceProof.createMany({
            data: [{
              shopId,
              documentId: request.documentId,
              type: ComplianceProofType.KSEF_NUMBER,
              externalReference: ksefNumber,
              contentHash: sha256(ksefNumber),
              content: ksefNumber,
            }],
            skipDuplicates: true,
          });
        }
        await tx.complianceEvent.create({
          data: { shopId, documentId: request.documentId, eventType: 'compliance.ksef.reconciled', payloadHash: responseHash, payload: { requestId, code, accepted, rejected } },
        });
        return updated;
      });
    } catch (error) {
      await this.prisma.complianceRequest.update({
        where: { id: request.id },
        data: {
          state: ComplianceRequestState.UNKNOWN,
          reconciliationRequired: true,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          errorCode: 'KSEF_RECONCILE_UNKNOWN',
          errorMessage: error instanceof Error ? error.message : 'KSeF reconcile failed',
        },
      });
      throw new ConflictException('KSeF status is currently unknown; retry reconciliation instead of resubmitting');
    }
  }

  async addProof(actor: JwtAccessPayload, id: string, dto: AddComplianceProofDto) {
    this.assertPermission(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    await this.requirePoland(shopId);
    const doc = await this.prisma.complianceDocument.findFirst({ where: { id, shopId }, select: { id: true } });
    if (!doc) throw new NotFoundException('Compliance document not found');
    const contentHash = this.crypto.hashText(dto.content);
    return this.prisma.complianceProof.upsert({
      where: { shopId_documentId_type_contentHash: { shopId, documentId: id, type: dto.type as ComplianceProofType, contentHash } },
      create: {
        shopId,
        documentId: id,
        type: dto.type as ComplianceProofType,
        externalReference: dto.externalReference?.trim() || null,
        contentHash,
        content: dto.content,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {},
    });
  }
}
