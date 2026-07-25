import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StaffActionKind,
  StaffActionRequestStatus,
} from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import {
  assertUserPassword,
  requireConfirmPassword,
} from '../../common/security/verify-password.util';
import { verifyPassword } from '../../common/security/password';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { MenuService } from '../menu/menu.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourcesService } from '../resources/resources.service';
import type {
  ApproveWithManagerDto,
  CreateStaffActionRequestDto,
  ResolveStaffActionRequestDto,
  StaffActionPatchDto,
} from './dto/staff-approvals.dto';

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StaffApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly menu: MenuService,
    private readonly resources: ResourcesService,
  ) {}

  private requiredPermissionFor(kind: StaffActionKind): string {
    if (kind === StaffActionKind.MENU_ITEM_UPDATE) {
      return PERMISSIONS.MENU_WRITE;
    }
    return PERMISSIONS.RESOURCE_WRITE;
  }

  private actorHasWrite(actor: JwtAccessPayload, permission: string): boolean {
    if (actor.shopRole === 'OWNER') return true;
    return hasPermission(actor.perms ?? '', permission as never);
  }

  private canApprove(
    actor: JwtAccessPayload,
    requiredPermission: string,
  ): boolean {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return true;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE)) return true;
    return this.actorHasWrite(actor, requiredPermission);
  }

  private assertPatchNotEmpty(patch: StaffActionPatchDto) {
    const keys = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== undefined,
    );
    if (keys.length === 0) {
      throw new BadRequestException('Proposed change is empty.');
    }
  }

  private async resolveTargetLabel(
    shopId: string,
    kind: StaffActionKind,
    targetId: string,
  ): Promise<string> {
    if (kind === StaffActionKind.MENU_ITEM_UPDATE) {
      const item = await this.prisma.menuItem.findFirst({
        where: { id: targetId, shopId },
        select: { name: true },
      });
      if (!item) throw new NotFoundException('Menu item not found.');
      return item.name;
    }
    if (kind === StaffActionKind.RESOURCE_UNIT_UPDATE) {
      const unit = await this.prisma.resource.findFirst({
        where: { id: targetId, shopId },
        select: { name: true },
      });
      if (!unit) throw new NotFoundException('Resource unit not found.');
      return unit.name;
    }
    const cat = await this.prisma.resourceCategory.findFirst({
      where: { id: targetId, shopId },
      select: { name: true },
    });
    if (!cat) throw new NotFoundException('Game offering not found.');
    return cat.name;
  }

  private serialize(row: {
    id: string;
    kind: StaffActionKind;
    targetId: string;
    targetLabel: string;
    proposedPatch: string;
    requiredPermission: string;
    status: StaffActionRequestStatus;
    note: string | null;
    resolveNote: string | null;
    expiresAt: Date;
    resolvedAt: Date | null;
    createdAt: Date;
    requester: { id: string; name: string | null; email: string };
    approver: { id: string; name: string | null; email: string } | null;
  }) {
    let patch: unknown = {};
    try {
      patch = JSON.parse(row.proposedPatch) as unknown;
    } catch {
      patch = {};
    }
    return {
      id: row.id,
      kind: row.kind,
      targetId: row.targetId,
      targetLabel: row.targetLabel,
      patch,
      requiredPermission: row.requiredPermission,
      status: row.status,
      note: row.note,
      resolveNote: row.resolveNote,
      expiresAt: row.expiresAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      requester: {
        id: row.requester.id,
        name: row.requester.name,
        email: row.requester.email,
      },
      approver: row.approver
        ? {
            id: row.approver.id,
            name: row.approver.name,
            email: row.approver.email,
          }
        : null,
    };
  }

  async list(actor: JwtAccessPayload, status?: string) {
    const shopId = requireShopId(actor);
    await this.expireStale(shopId);
    const whereStatus =
      status === 'PENDING' ||
      status === 'APPROVED' ||
      status === 'REJECTED' ||
      status === 'CANCELLED' ||
      status === 'EXPIRED'
        ? (status as StaffActionRequestStatus)
        : undefined;

    const canSeeAll = this.canApprove(actor, PERMISSIONS.MENU_WRITE);
    const rows = await this.prisma.staffActionRequest.findMany({
      where: {
        shopId,
        ...(whereStatus ? { status: whereStatus } : {}),
        ...(!canSeeAll ? { requesterUserId: actor.sub } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });
    return {
      items: rows.map((r) => this.serialize(r)),
      pendingCount: await this.prisma.staffActionRequest.count({
        where: {
          shopId,
          status: StaffActionRequestStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      }),
    };
  }

  async create(actor: JwtAccessPayload, dto: CreateStaffActionRequestDto) {
    const shopId = requireShopId(actor);
    this.assertPatchNotEmpty(dto.patch);
    const requiredPermission = this.requiredPermissionFor(dto.kind);
    if (this.actorHasWrite(actor, requiredPermission)) {
      throw new BadRequestException(
        'You already have permission to make this change directly.',
      );
    }

    const targetLabel = await this.resolveTargetLabel(
      shopId,
      dto.kind,
      dto.targetId,
    );
    const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);
    const row = await this.prisma.staffActionRequest.create({
      data: {
        shopId,
        requesterUserId: actor.sub,
        kind: dto.kind,
        targetId: dto.targetId,
        targetLabel,
        proposedPatch: JSON.stringify(dto.patch),
        requiredPermission,
        note: dto.note?.trim() || null,
        expiresAt,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    const who = actor.email;
    await this.notifications.recordTeamEvent(shopId, {
      title: 'Staff change request',
      body: `${who} requested a ${dto.kind.replace(/_/g, ' ').toLowerCase()} on “${targetLabel}”. Approve in Staff approvals (one-time only).`,
      href: '/approvals',
      dedupeKey: `staff-action:${row.id}`,
    });

    await this.audit.record(actor, {
      section: 'team',
      action: 'staff.action_request.create',
      summary: `Requested privileged edit on “${targetLabel}”`,
      meta: {
        requestId: row.id,
        kind: dto.kind,
        targetId: dto.targetId,
        patch: dto.patch,
      },
    });

    return this.serialize(row);
  }

  private async expireStale(shopId: string) {
    await this.prisma.staffActionRequest.updateMany({
      where: {
        shopId,
        status: StaffActionRequestStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: StaffActionRequestStatus.EXPIRED,
        resolvedAt: new Date(),
        resolveNote: 'Expired without approval',
      },
    });
  }

  private async loadPending(shopId: string, id: string) {
    await this.expireStale(shopId);
    const row = await this.prisma.staffActionRequest.findFirst({
      where: { id, shopId },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Request not found.');
    if (row.status !== StaffActionRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${row.status}.`);
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.staffActionRequest.update({
        where: { id: row.id },
        data: {
          status: StaffActionRequestStatus.EXPIRED,
          resolvedAt: new Date(),
          resolveNote: 'Expired without approval',
        },
      });
      throw new BadRequestException('Request expired.');
    }
    return row;
  }

  private async applyPatch(
    approver: JwtAccessPayload,
    kind: StaffActionKind,
    targetId: string,
    patch: StaffActionPatchDto,
  ) {
    if (kind === StaffActionKind.MENU_ITEM_UPDATE) {
      return this.menu.updateItem(approver, targetId, {
        ...(patch.name != null && { name: patch.name }),
        ...(patch.description !== undefined && {
          description: patch.description ?? undefined,
        }),
        ...(patch.price != null && { price: patch.price }),
        ...(patch.isAvailable != null && { isAvailable: patch.isAvailable }),
      });
    }
    if (kind === StaffActionKind.RESOURCE_UNIT_UPDATE) {
      return this.resources.updateResource(approver, targetId, {
        ...(patch.name != null && { name: patch.name }),
        ...(patch.description !== undefined && {
          description: patch.description ?? undefined,
        }),
        ...(patch.hourlyRate != null && { hourlyRate: patch.hourlyRate }),
      });
    }
    return this.resources.updateCategory(approver, targetId, {
      ...(patch.name != null && { name: patch.name }),
      ...(patch.description !== undefined && {
        description: patch.description ?? undefined,
      }),
      ...(patch.rates != null && { rates: patch.rates }),
    });
  }

  async approve(
    actor: JwtAccessPayload,
    id: string,
    dto: ResolveStaffActionRequestDto,
    headerPassword?: string | null,
  ) {
    const shopId = requireShopId(actor);
    const password = requireConfirmPassword(dto.password, headerPassword);
    await assertUserPassword(this.prisma, actor.sub, password);

    const row = await this.loadPending(shopId, id);
    if (!this.canApprove(actor, row.requiredPermission)) {
      throw new ForbiddenException(
        'Only an owner, manager, or someone with write access can approve.',
      );
    }

    let patch: StaffActionPatchDto = {};
    try {
      patch = JSON.parse(row.proposedPatch) as StaffActionPatchDto;
    } catch {
      throw new BadRequestException('Invalid stored patch.');
    }

    await this.applyPatch(actor, row.kind, row.targetId, patch);

    const updated = await this.prisma.staffActionRequest.update({
      where: { id: row.id },
      data: {
        status: StaffActionRequestStatus.APPROVED,
        approverUserId: actor.sub,
        resolvedAt: new Date(),
        resolveNote: dto.resolveNote?.trim() || null,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    await this.audit.record(actor, {
      section: 'team',
      action: 'staff.action_request.approve',
      summary: `Approved one-time edit on “${row.targetLabel}” (no lasting permission grant)`,
      meta: {
        requestId: row.id,
        kind: row.kind,
        targetId: row.targetId,
        requesterUserId: row.requesterUserId,
        patch,
      },
    });

    await this.notifications.recordTeamEvent(shopId, {
      title: 'Change request approved',
      body: `One-time approval applied for “${row.targetLabel}”. Staff still need approval next time.`,
      href: '/approvals',
      dedupeKey: `staff-action-approved:${row.id}`,
    });

    return this.serialize(updated);
  }

  /**
   * Manager types their email+password on the staff device.
   * Does not grant lasting perms — only applies this one patch.
   */
  async approveWithManager(
    actor: JwtAccessPayload,
    id: string,
    dto: ApproveWithManagerDto,
  ) {
    const shopId = requireShopId(actor);
    const email = dto.managerEmail.trim().toLowerCase();
    if (!email || !dto.managerPassword?.trim()) {
      throw new BadRequestException('Manager email and password are required.');
    }

    const manager = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        memberships: {
          where: { shopId, isActive: true },
          take: 1,
          include: { permissionRows: true },
        },
      },
    });
    if (!manager?.memberships[0]) {
      await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$invalidsalt$invalid',
        dto.managerPassword,
      );
      throw new ForbiddenException('Manager credentials rejected.');
    }
    const ok = await verifyPassword(manager.passwordHash, dto.managerPassword);
    if (!ok) {
      throw new ForbiddenException('Manager credentials rejected.');
    }

    const membership = manager.memberships[0];
    const perms =
      membership.role === 'OWNER'
        ? '*'
        : membership.permissionRows.map((p) => p.permission).join(',');
    const managerActor: JwtAccessPayload = {
      sub: manager.id,
      email: manager.email,
      sysRole: 'USER',
      shopId,
      shopRole: membership.role,
      perms,
    };

    const row = await this.loadPending(shopId, id);
    if (!this.canApprove(managerActor, row.requiredPermission)) {
      throw new ForbiddenException(
        'That account cannot approve this change.',
      );
    }

    let patch: StaffActionPatchDto = {};
    try {
      patch = JSON.parse(row.proposedPatch) as StaffActionPatchDto;
    } catch {
      throw new BadRequestException('Invalid stored patch.');
    }

    await this.applyPatch(managerActor, row.kind, row.targetId, patch);

    const updated = await this.prisma.staffActionRequest.update({
      where: { id: row.id },
      data: {
        status: StaffActionRequestStatus.APPROVED,
        approverUserId: manager.id,
        resolvedAt: new Date(),
        resolveNote: dto.resolveNote?.trim() || null,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    await this.audit.record(managerActor, {
      section: 'team',
      action: 'staff.action_request.approve_local',
      summary: `Approved one-time edit on “${row.targetLabel}” at staff device (no lasting grant)`,
      meta: {
        requestId: row.id,
        kind: row.kind,
        targetId: row.targetId,
        requesterUserId: row.requesterUserId,
        staffPresentUserId: actor.sub,
        patch,
      },
    });

    return this.serialize(updated);
  }

  async reject(
    actor: JwtAccessPayload,
    id: string,
    dto: ResolveStaffActionRequestDto,
    headerPassword?: string | null,
  ) {
    const shopId = requireShopId(actor);
    const password = requireConfirmPassword(dto.password, headerPassword);
    await assertUserPassword(this.prisma, actor.sub, password);

    const row = await this.loadPending(shopId, id);
    if (!this.canApprove(actor, row.requiredPermission)) {
      throw new ForbiddenException(
        'Only an owner, manager, or someone with write access can reject.',
      );
    }

    const updated = await this.prisma.staffActionRequest.update({
      where: { id: row.id },
      data: {
        status: StaffActionRequestStatus.REJECTED,
        approverUserId: actor.sub,
        resolvedAt: new Date(),
        resolveNote: dto.resolveNote?.trim() || null,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    await this.audit.record(actor, {
      section: 'team',
      action: 'staff.action_request.reject',
      summary: `Rejected privileged edit on “${row.targetLabel}”`,
      meta: {
        requestId: row.id,
        kind: row.kind,
        targetId: row.targetId,
        requesterUserId: row.requesterUserId,
      },
    });

    return this.serialize(updated);
  }

  async cancel(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const row = await this.loadPending(shopId, id);
    if (row.requesterUserId !== actor.sub && actor.shopRole !== 'OWNER') {
      throw new ForbiddenException('Only the requester can cancel this.');
    }
    const updated = await this.prisma.staffActionRequest.update({
      where: { id: row.id },
      data: {
        status: StaffActionRequestStatus.CANCELLED,
        resolvedAt: new Date(),
        resolveNote: 'Cancelled by requester',
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'staff.action_request.cancel',
      summary: `Cancelled privileged edit request on “${row.targetLabel}”`,
      meta: { requestId: row.id },
    });
    return this.serialize(updated);
  }
}
