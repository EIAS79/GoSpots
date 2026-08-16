import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplianceDocumentKind,
  ComplianceRequestState,
  KsefSpecialMode,
  KsefSpecialModeRecord,
  KsefSpecialModeStatus,
} from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../../common/permissions';
import { requireShopId } from '../../../common/tenant';
import { PrismaService } from '../../../prisma/prisma.service';
import type { JwtAccessPayload } from '../../auth/auth.service';
import type {
  LinkKsefSpecialModeSubmissionDto,
  RegisterKsefSpecialModeDto,
} from '../dto/ksef-special-mode.dto';

@Injectable()
export class KsefSpecialModeService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRead(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.INVOICE_READ)) return;
    throw new ForbiddenException('Missing invoice.read permission');
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.FISCAL_OVERRIDE)) return;
    throw new ForbiddenException('Missing fiscal.override permission');
  }

  async register(
    actor: JwtAccessPayload,
    documentId: string,
    dto: RegisterKsefSpecialModeDto,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    const document = await this.prisma.complianceDocument.findFirst({
      where: { id: documentId, shopId },
      select: { id: true, kind: true, state: true, payloadXml: true, ksefNumber: true },
    });
    if (!document) throw new NotFoundException('Compliance document not found');
    if (document.kind === ComplianceDocumentKind.RECEIPT) {
      throw new BadRequestException('KSeF special modes apply to invoices, not fiscal receipts');
    }
    if (!document.payloadXml?.trim()) {
      throw new BadRequestException('An immutable FA(3) XML snapshot is required before special-mode issuance');
    }
    if (document.ksefNumber) {
      throw new ConflictException('Document already has a KSeF number and cannot enter an offline issuance mode');
    }
    const issuedAt = new Date(dto.issuedAt);
    const deadline = dto.submissionDeadlineAt ? new Date(dto.submissionDeadlineAt) : null;
    if (dto.mode === KsefSpecialMode.TOTAL_FAILURE) {
      if (deadline) {
        throw new BadRequestException('TOTAL_FAILURE must not carry a deferred KSeF submission deadline');
      }
    } else {
      if (!deadline || deadline <= issuedAt) {
        throw new BadRequestException('Special KSeF mode requires a statutory submission deadline after issue time');
      }
    }
    if (
      dto.qrRequiredBeforeSubmit &&
      (!dto.offlineQrPayloadHash?.trim() ||
        !dto.offlineCertificateFingerprint?.trim() ||
        !dto.certificateQrPayloadHash?.trim())
    ) {
      throw new BadRequestException(
        'Offline delivery requiring QR evidence needs OFFLINE payload hash, Offline-certificate fingerprint and CERTYFIKAT payload hash',
      );
    }
    const existing = await this.prisma.ksefSpecialModeRecord.findUnique({ where: { documentId } });
    if (existing) return existing;

    const status = dto.mode === KsefSpecialMode.TOTAL_FAILURE
      ? KsefSpecialModeStatus.NO_SUBMISSION_REQUIRED
      : KsefSpecialModeStatus.AWAITING_SUBMISSION;
    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.ksefSpecialModeRecord.create({
        data: {
          shopId,
          documentId,
          mode: dto.mode,
          status,
          issuedAt,
          triggeringEventReference: dto.triggeringEventReference?.trim() || null,
          submissionDeadlineAt: deadline,
          buyerDeliveredAt: dto.buyerDeliveredAt ? new Date(dto.buyerDeliveredAt) : null,
          qrRequiredBeforeSubmit: dto.qrRequiredBeforeSubmit,
          offlineQrPayloadHash: dto.offlineQrPayloadHash?.trim() || null,
          offlineCertificateFingerprint: dto.offlineCertificateFingerprint?.trim() || null,
          certificateQrPayloadHash: dto.certificateQrPayloadHash?.trim() || null,
          legalBasisNote: dto.legalBasisNote.trim(),
          createdById: actor.sub,
          updatedById: actor.sub,
        },
      });
      await tx.auditLog.create({
        data: {
          shopId,
          userId: actor.sub,
          section: 'compliance',
          action: 'ksef.special_mode.register',
          summary: `KSeF special mode ${dto.mode} registered`,
          actorRole: actor.shopRole ?? null,
          reason: dto.legalBasisNote.trim(),
          newState: {
            documentId,
            mode: dto.mode,
            status,
            submissionDeadlineAt: deadline?.toISOString() ?? null,
            qrRequiredBeforeSubmit: dto.qrRequiredBeforeSubmit,
          },
        },
      });
      return record;
    });
    return created;
  }

  async linkSubmission(
    actor: JwtAccessPayload,
    documentId: string,
    dto: LinkKsefSpecialModeSubmissionDto,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    const record = await this.prisma.ksefSpecialModeRecord.findFirst({
      where: { documentId, shopId },
    });
    if (!record) throw new NotFoundException('KSeF special-mode record not found');
    if (record.mode === KsefSpecialMode.TOTAL_FAILURE) {
      throw new ConflictException('TOTAL_FAILURE record is explicitly not deferred for KSeF submission');
    }
    const request = await this.prisma.complianceRequest.findFirst({
      where: {
        id: dto.complianceRequestId,
        shopId,
        documentId,
        adapter: 'PL_KSEF',
        operation: 'SUBMIT_INVOICE',
      },
    });
    if (!request) throw new NotFoundException('Matching KSeF submission request not found');
    const reconciled = request.state === ComplianceRequestState.SUCCEEDED;
    const nextStatus = reconciled
      ? KsefSpecialModeStatus.RECONCILED
      : KsefSpecialModeStatus.SUBMITTED;
    return this.prisma.ksefSpecialModeRecord.update({
      where: { id: record.id },
      data: {
        complianceRequestId: request.id,
        submittedAt: record.submittedAt ?? new Date(),
        reconciledAt: reconciled ? new Date() : null,
        status: nextStatus,
        updatedById: actor.sub,
      },
    });
  }

  async listAttention(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const now = new Date();
    const awaiting = await this.prisma.ksefSpecialModeRecord.findMany({
      where: {
        shopId,
        status: { in: [KsefSpecialModeStatus.AWAITING_SUBMISSION, KsefSpecialModeStatus.SUBMITTED] },
      },
      orderBy: [{ submissionDeadlineAt: 'asc' }, { issuedAt: 'asc' }],
      take: 250,
    });
    const overdueIds = awaiting
      .filter((record) => record.submissionDeadlineAt && record.submissionDeadlineAt < now)
      .map((record) => record.id);
    if (overdueIds.length) {
      await this.prisma.ksefSpecialModeRecord.updateMany({
        where: { shopId, id: { in: overdueIds }, status: KsefSpecialModeStatus.AWAITING_SUBMISSION },
        data: { status: KsefSpecialModeStatus.OVERDUE_REVIEW, updatedById: actor.sub },
      });
    }
    const records = await this.prisma.ksefSpecialModeRecord.findMany({
      where: {
        shopId,
        status: {
          in: [
            KsefSpecialModeStatus.AWAITING_SUBMISSION,
            KsefSpecialModeStatus.SUBMITTED,
            KsefSpecialModeStatus.OVERDUE_REVIEW,
          ],
        },
      },
      orderBy: [{ submissionDeadlineAt: 'asc' }, { issuedAt: 'asc' }],
      take: 250,
    });
    return {
      checkedAt: now.toISOString(),
      overdueCount: records.filter((record) => record.status === KsefSpecialModeStatus.OVERDUE_REVIEW).length,
      records,
    };
  }

  async getForDocument(actor: JwtAccessPayload, documentId: string): Promise<KsefSpecialModeRecord | null> {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    return this.prisma.ksefSpecialModeRecord.findFirst({ where: { documentId, shopId } });
  }
}
