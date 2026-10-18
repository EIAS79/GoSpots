import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import {
  Prisma, PrintIncidentOutcome, PrintIncidentState, PrintJobStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { requireShopId } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IncidentMutationDto, IncidentEvidenceDto, IncidentDecisionDto,
} from './dto/print-incident-resolution.dto';

type Transaction = Prisma.TransactionClient;
const UNCERTAIN = ['EDGE_PRINT_OUTCOME_UNKNOWN', 'EDGE_PRINT_LEASE_EXPIRED'];
const PRIVILEGED_ROLES = ['OWNER', 'MANAGER', 'SUPERVISOR'];

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Legacy shop.manage access to inspection is preserved. Investigation and
// resolution remain separate explicit grants; neither is implied by shop.manage.
export function assertPrintIncidentRead(actor: JwtAccessPayload) {
  if (!PRIVILEGED_ROLES.includes(actor.shopRole ?? '') ||
      !(hasPermission(actor.perms ?? '', PERMISSIONS.PRINT_INCIDENT_READ) ||
        hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE))) {
    throw new ForbiddenException('Print incident review requires an authorized venue role and read grant');
  }
}

function checkAccess(actor: JwtAccessPayload, permission: string) {
  if (!PRIVILEGED_ROLES.includes(actor.shopRole ?? '') ||
      !hasPermission(actor.perms ?? '', permission as never)) {
    throw new ForbiddenException('Print incident action requires an explicit venue grant');
  }
}

@Injectable()
export class PrintIncidentResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  assertRead(actor: JwtAccessPayload) {
    assertPrintIncidentRead(actor);
  }

  assertInvestigate(actor: JwtAccessPayload) {
    assertPrintIncidentRead(actor);
    checkAccess(actor, PERMISSIONS.PRINT_INCIDENT_INVESTIGATE);
  }

  assertResolve(actor: JwtAccessPayload) {
    assertPrintIncidentRead(actor);
    checkAccess(actor, PERMISSIONS.PRINT_INCIDENT_RESOLVE);
  }

  // Venue membership identity comes exclusively from the database. Owners are
  // permitted to have no Membership row, but ownership must match Shop.ownerId.
  private async resolveActorMembership(tx: Transaction, actor: JwtAccessPayload, shopId: string) {
    const membership = await tx.membership.findUnique({
      where: { userId_shopId: { userId: actor.sub, shopId } },
      select: { id: true, isActive: true, role: true },
    });
    if (actor.shopRole === 'OWNER') {
      const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
      if (!shop || shop.ownerId !== actor.sub) {
        throw new ForbiddenException('Authenticated user is not the venue owner');
      }
      return membership?.isActive ? membership.id : null;
    }
    if (!membership?.isActive || membership.role !== actor.shopRole) {
      throw new ForbiddenException('Active venue membership is required for incident action');
    }
    return membership.id;
  }

  // Called *inside* the physical job transition transaction. Safe on legacy
  // cases and concurrent detectors; never modifies claim/status/print payload.
  static async recordTransition(
    tx: Transaction,
    job: { id: string; shopId: string; lastErrorCode?: string | null },
    kind: 'UNCERTAINTY_DETECTED' | 'LATE_EDGE_SUCCESS',
    reason: string,
  ) {
    const existing = await tx.printIncidentCase.findUnique({
      where: { shopId_originalPrintJobId: { shopId: job.shopId, originalPrintJobId: job.id } },
    });
    let incident = existing;
    if (!incident) {
      incident = await tx.printIncidentCase.create({
        data: {
          id: randomUUID(), shopId: job.shopId, originalPrintJobId: job.id,
          state: PrintIncidentState.OPEN,
        },
      });
    }
    if (!existing && kind === 'LATE_EDGE_SUCCESS') {
      await tx.printIncidentEvent.create({
        data: {
          shopId: job.shopId, caseId: incident.id,
          originalPrintJobId: job.id, kind: 'UNCERTAINTY_DETECTED',
          reason: 'Legacy uncertain physical outcome discovered at late original Edge success',
          idempotencyKey: 'system:uncertain',
          requestHash: fingerprint({ kind: 'UNCERTAINTY_DETECTED', original: job.id }),
        },
      });
    }
    const key = kind === 'UNCERTAINTY_DETECTED' ? 'system:uncertain' : 'system:late-success';
    const found = await tx.printIncidentEvent.findUnique({
      where: { shopId_caseId_idempotencyKey: {
        shopId: job.shopId, caseId: incident.id, idempotencyKey: key,
      } },
    });
    if (!found) {
      await tx.printIncidentEvent.create({
        data: {
          shopId: job.shopId, caseId: incident.id,
          originalPrintJobId: job.id, kind, reason,
          idempotencyKey: key, requestHash: fingerprint({ kind, original: job.id }),
        },
      });
    }
    if (kind === 'LATE_EDGE_SUCCESS' && incident.state !== PrintIncidentState.CONFLICT) {
      // If it was classified NOT PRINTED, preserve the contradictory decision
      // and escalate instead of silently overwriting the original evidence.
      await tx.printIncidentCase.updateMany({
        where: { shopId: job.shopId, id: incident.id, version: incident.version },
        data: incident.physicalOutcome === PrintIncidentOutcome.CONFIRMED_NOT_PRINTED
          ? { state: PrintIncidentState.CONFLICT, resolvedAt: null, version: { increment: 1 } }
          : { version: { increment: 1 } },
      });
    }
    return incident.id;
  }

  private async jobForShop(tx: Transaction, actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const job = await tx.printJob.findFirst({
      where: { id, shopId },
      select: {
        id: true, shopId: true, type: true, status: true,
        lastErrorCode: true, sourceType: true, sourceId: true,
        printerDeviceId: true, claimedByEdgeDeviceId: true,
        claimedAt: true, printingAt: true, printedAt: true,
      },
    });
    if (!job) throw new NotFoundException('Print incident not found');
    return job;
  }

  async read(actor: JwtAccessPayload, jobId: string) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const job = await this.prisma.printJob.findFirst({
      where: { id: jobId, shopId },
      select: { id: true, status: true, lastErrorCode: true, claimedAt: true, printedAt: true },
    });
    if (!job) throw new NotFoundException('Print incident not found');
    const incident = await this.prisma.printIncidentCase.findUnique({
      where: { shopId_originalPrintJobId: { shopId, originalPrintJobId: jobId } },
      include: { events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!incident && !UNCERTAIN.includes(job.lastErrorCode ?? '')) {
      throw new NotFoundException('No physical print incident exists');
    }
    return { originalJob: job, incident };
  }

  private async mutate(
    actor: JwtAccessPayload,
    jobId: string,
    kind: 'INVESTIGATION_STARTED' | 'EVIDENCE_RECORDED' | 'DECISION_RECORDED',
    dto: IncidentMutationDto,
    evidence?: Prisma.InputJsonObject,
    outcome?: PrintIncidentOutcome,
  ) {
    const shopId = requireShopId(actor);
    if (dto.reason.trim().length < 8) throw new BadRequestException('Reason is required');
    return this.prisma.$transaction(async (tx) => {
      const actorMembershipId = await this.resolveActorMembership(tx, actor, shopId);
      const job = await this.jobForShop(tx, actor, jobId);
      let incident = await tx.printIncidentCase.findUnique({
        where: { shopId_originalPrintJobId: { shopId, originalPrintJobId: job.id } },
      });
      if (!incident) {
        if (!UNCERTAIN.includes(job.lastErrorCode ?? '')) {
          throw new ConflictException('Job has no unverified physical output');
        }
        incident = await tx.printIncidentCase.create({
          data: { id: randomUUID(), shopId, originalPrintJobId: job.id },
        });
        await tx.printIncidentEvent.create({
          data: { shopId, caseId: incident.id, originalPrintJobId: job.id,
            kind: 'UNCERTAINTY_DETECTED', reason: 'Historical uncertain print job discovered during investigation',
            idempotencyKey: 'system:uncertain' },
        });
      }
      const requestHash = fingerprint({ kind, jobId, actorUserId: actor.sub, actorMembershipId, expectedVersion: dto.expectedVersion, reason: dto.reason.trim(), evidence, outcome });
      const repeated = await tx.printIncidentEvent.findUnique({
        where: { shopId_caseId_idempotencyKey: { shopId, caseId: incident.id, idempotencyKey: dto.idempotencyKey } },
      });
      if (repeated) {
        if (repeated.requestHash !== requestHash) {
          throw new ConflictException('Idempotency key used for a different incident action');
        }
        return incident;
      }
      if (incident.version !== dto.expectedVersion) {
        throw new ConflictException('Incident changed; refresh the investigation');
      }
      if (incident.state === PrintIncidentState.RESOLVED ||
          incident.state === PrintIncidentState.CONFLICT) {
        throw new ConflictException('Incident is already resolved or requires conflict escalation');
      }
      if (kind === 'INVESTIGATION_STARTED' && incident.state !== PrintIncidentState.OPEN) {
        throw new ConflictException('Investigation already started; reassignment is not authorized');
      }
      if (kind !== 'INVESTIGATION_STARTED' && incident.state !== PrintIncidentState.INVESTIGATING) {
        throw new ConflictException('Start investigation before recording evidence or decision');
      }
      if (kind === 'DECISION_RECORDED') {
        if (job.status === PrintJobStatus.SUCCEEDED || job.printedAt) {
          throw new ConflictException('Original Edge has confirmed success; refresh before decision');
        }
        const evidenceCount = await tx.printIncidentEvent.count({
          where: { shopId, caseId: incident.id, kind: 'EVIDENCE_RECORDED' },
        });
        if (evidenceCount === 0) throw new ConflictException('Recorded physical evidence is required');
      }
      const complete = kind === 'DECISION_RECORDED' && outcome !== PrintIncidentOutcome.UNDETERMINED;
      const updated = await tx.printIncidentCase.updateMany({
        where: { id: incident.id, shopId, version: dto.expectedVersion,
          state: incident.state },
        data: {
          version: { increment: 1 },
          ...(kind === 'INVESTIGATION_STARTED' ? { state: PrintIncidentState.INVESTIGATING,
            openedById: actor.sub } : {}),
          ...(kind === 'DECISION_RECORDED' ? {
            physicalOutcome: outcome, decidedById: actor.sub,
            reason: dto.reason.trim(),
            state: complete ? PrintIncidentState.RESOLVED : PrintIncidentState.INVESTIGATING,
            resolvedAt: complete ? new Date() : null,
          } : {}),
        },
      });
      if (updated.count !== 1) throw new ConflictException('Concurrent incident decision; refresh');
      await tx.printIncidentEvent.create({
        data: {
          shopId, caseId: incident.id, originalPrintJobId: job.id,
          kind, actorUserId: actor.sub, actorMembershipId,
          reason: dto.reason.trim(), evidence, physicalOutcome: outcome,
          idempotencyKey: dto.idempotencyKey, requestHash,
        },
      });
      return tx.printIncidentCase.findUniqueOrThrow({ where: { id: incident.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  investigate(actor: JwtAccessPayload, jobId: string, dto: IncidentMutationDto) {
    this.assertInvestigate(actor);
    return this.mutate(actor, jobId, 'INVESTIGATION_STARTED', dto);
  }

  addEvidence(actor: JwtAccessPayload, jobId: string, dto: IncidentEvidenceDto) {
    this.assertInvestigate(actor);
    return this.mutate(actor, jobId, 'EVIDENCE_RECORDED', dto, {
      method: dto.method, reference: dto.reference.trim(),
      observedAt: dto.observedAt, ...(dto.notes ? { notes: dto.notes.trim() } : {}),
    });
  }

  decide(actor: JwtAccessPayload, jobId: string, dto: IncidentDecisionDto) {
    this.assertResolve(actor);
    return this.mutate(actor, jobId, 'DECISION_RECORDED', dto, undefined, dto.physicalOutcome);
  }
}
