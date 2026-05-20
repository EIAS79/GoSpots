import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ShopRole, SubscriptionTier } from "@prisma/client";
import { PERMISSIONS } from "../../common/permissions";
import {
  resolveEffectiveTier,
  staffSeatLimit,
  tierHasFeature,
} from "../../common/subscription-tier";
import {
  buildStaffLoginEmail,
  isValidStaffHandle,
} from "../../common/venue-account";
import { randomBytes } from "crypto";
import {
  generateStaffInviteToken,
  hashToken,
  STAFF_INVITE_TTL_MS,
} from "../../common/security/token";
import {
  hashPassword,
} from "../../common/security/password";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { JwtAccessPayload } from "../auth/auth.service";
import { CreateStaffDto, UpdateStaffDto } from "./dto/staff.dto";

const ASSIGNABLE_PERMISSIONS = Object.values(PERMISSIONS).filter(
  (p) => p !== PERMISSIONS.STAFF_WRITE && p !== PERMISSIONS.SUBSCRIPTION_MANAGE,
);

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertShopContext(actor: JwtAccessPayload) {
    if (!actor.shopId) {
      throw new ForbiddenException("No venue context. Sign in as venue staff.");
    }
    if (actor.shopRole !== "OWNER" && actor.shopRole !== "MANAGER") {
      throw new ForbiddenException("Only venue admins can manage staff.");
    }
    if (actor.shopRole === "MANAGER" && !actor.perms?.includes("*")) {
      const set = new Set(
        (actor.perms ?? "").split(",").map((s) => s.trim()),
      );
      if (!set.has(PERMISSIONS.STAFF_WRITE)) {
        throw new ForbiddenException("Missing staff.write permission.");
      }
    }
    return actor.shopId;
  }

  private async getShopWithTier(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { subscription: true },
    });
    if (!shop) throw new NotFoundException("Venue not found.");
    const tier = resolveEffectiveTier(shop.subscription);
    return { shop, tier };
  }

  private async countStaffSeats(shopId: string): Promise<number> {
    return this.prisma.membership.count({
      where: {
        shopId,
        role: { in: [ShopRole.STAFF, ShopRole.MANAGER] },
        isActive: true,
        user: { accountType: "VENUE_STAFF" },
      },
    });
  }

  private permissionsToCsv(perms?: string[]): string {
    if (!perms?.length) return "";
    const allowed = new Set(ASSIGNABLE_PERMISSIONS);
    const filtered = perms.filter((p) =>
      allowed.has(p as (typeof ASSIGNABLE_PERMISSIONS)[number]),
    );
    return filtered.join(",");
  }

  async list(actor: JwtAccessPayload) {
    const shopId = this.assertShopContext(actor);
    const { shop, tier } = await this.getShopWithTier(shopId);
    const used = await this.countStaffSeats(shopId);
    const limit = staffSeatLimit(tier);

    const rows = await this.prisma.membership.findMany({
      where: {
        shopId,
        role: { in: [ShopRole.STAFF, ShopRole.MANAGER] },
        user: { accountType: "VENUE_STAFF" },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            staffHandle: true,
            passwordSetAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      seats: { used, limit, tier },
      canCreateEmployees:
        limit > 0 && tierHasFeature(tier, "roles") && actor.shopRole === "OWNER",
      loginSuffix: ".venueflow",
      venueSlug: shop.slug,
      seatPolicy:
        "One employee login = one person. They set their own password via a private setup link. Only one active session per account.",
        staff: rows.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        loginId: m.user.email,
        username: m.user.staffHandle,
        name: m.user.name,
        role: m.role,
        permissions: m.permissions,
        isActive: m.isActive,
        activated: !!m.user.passwordSetAt,
        pendingInvite: !m.user.passwordSetAt,
        createdAt: m.createdAt,
      })),
      assignablePermissions: ASSIGNABLE_PERMISSIONS,
    };
  }

  async create(actor: JwtAccessPayload, dto: CreateStaffDto) {
    const shopId = this.assertShopContext(actor);
    if (actor.shopRole !== "OWNER") {
      throw new ForbiddenException("Only the venue owner can add staff.");
    }

    const handle = dto.username.trim().toLowerCase();
    if (!isValidStaffHandle(handle)) {
      throw new BadRequestException("Invalid username.");
    }

    const { shop, tier } = await this.getShopWithTier(shopId);
    if (!tierHasFeature(tier, "roles")) {
      throw new ForbiddenException(
        "Employee accounts require a paid plan (Pro or higher). Upgrade to unlock Team features.",
      );
    }
    const used = await this.countStaffSeats(shopId);
    const limit = staffSeatLimit(tier);
    if (limit === 0 || used >= limit) {
      throw new ForbiddenException(
        `Employee limit reached (${used}/${limit} on ${tier}). Upgrade your plan.`,
      );
    }

    const loginEmail = buildStaffLoginEmail(handle, shop.slug);
    const existing = await this.prisma.user.findUnique({
      where: { email: loginEmail },
    });
    if (existing) {
      throw new ConflictException(
        `Username "${handle}" is already taken at this venue.`,
      );
    }

    const role =
      dto.role === ShopRole.MANAGER ? ShopRole.MANAGER : ShopRole.STAFF;

    const inviteRaw = generateStaffInviteToken();
    const inviteTokenHash = hashToken(inviteRaw);
    const inviteExpiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);
    const placeholderHash = await hashPassword(
      randomBytes(32).toString("base64url"),
    );
    const permissions = this.permissionsToCsv(dto.permissions);
    const webOrigin = process.env.WEB_APP_URL ?? "http://localhost:3000";

    const membership = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: loginEmail,
          passwordHash: placeholderHash,
          name: dto.name?.trim() || handle,
          accountType: "VENUE_STAFF",
          staffHandle: handle,
          emailVerified: true,
          passwordSetAt: null,
        },
      });
      return tx.membership.create({
        data: {
          userId: user.id,
          shopId,
          role,
          permissions,
          invitedBy: actor.sub,
          isActive: true,
          inviteTokenHash,
          inviteExpiresAt,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              staffHandle: true,
            },
          },
        },
      });
    });

    await this.audit.record(actor, {
      section: "team",
      action: "staff.create",
      summary: `Created employee account ${loginEmail}`,
      meta: { staffUserId: membership.userId, loginEmail, role },
    });

    await this.notifications.recordTeamEvent(shopId, {
      title: "New employee invited",
      body: `${dto.name ?? loginEmail} was added. Share their setup link so they can sign in.`,
      href: "/staff",
    });

    const activationUrl = `${webOrigin}/staff/activate?token=${encodeURIComponent(inviteRaw)}`;

    return {
      membershipId: membership.id,
      loginId: membership.user.email,
      username: membership.user.staffHandle,
      name: membership.user.name,
      role: membership.role,
      permissions: membership.permissions,
      isActive: membership.isActive,
      activated: false,
      pendingInvite: true,
      activationUrl,
      activationExpiresAt: inviteExpiresAt.toISOString(),
    };
  }

  async regenerateInvite(actor: JwtAccessPayload, membershipId: string) {
    const shopId = this.assertShopContext(actor);
    if (actor.shopRole !== "OWNER") {
      throw new ForbiddenException("Only the venue owner can reset employee setup.");
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        shopId,
        user: { accountType: "VENUE_STAFF" },
      },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException("Staff member not found.");

    const inviteRaw = generateStaffInviteToken();
    const inviteExpiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);
    const webOrigin = process.env.WEB_APP_URL ?? "http://localhost:3000";

    const placeholderHash = await hashPassword(
      randomBytes(32).toString("base64url"),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.membership.update({
        where: { id: membershipId },
        data: {
          inviteTokenHash: hashToken(inviteRaw),
          inviteExpiresAt,
        },
      });
      await tx.user.update({
        where: { id: membership.userId },
        data: {
          passwordSetAt: null,
          passwordHash: placeholderHash,
        },
      });
    });

    const activationUrl = `${webOrigin}/staff/activate?token=${encodeURIComponent(inviteRaw)}`;

    await this.audit.record(actor, {
      section: "team",
      action: "staff.invite.reset",
      summary: `Reset setup link for ${membership.user.email}`,
      meta: { membershipId },
    });

    await this.notifications.recordTeamEvent(shopId, {
      title: "Employee setup link reset",
      body: `A new activation link was issued for ${membership.user.email}.`,
      href: "/staff",
    });

    return {
      membershipId,
      loginId: membership.user.email,
      activationUrl,
      activationExpiresAt: inviteExpiresAt.toISOString(),
    };
  }

  async update(
    actor: JwtAccessPayload,
    membershipId: string,
    dto: UpdateStaffDto,
  ) {
    const shopId = this.assertShopContext(actor);
    if (actor.shopRole !== "OWNER") {
      throw new ForbiddenException("Only the venue owner can edit staff.");
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        shopId,
        user: { accountType: "VENUE_STAFF" },
      },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException("Staff member not found.");

    if (dto.role === ShopRole.OWNER) {
      throw new BadRequestException("Cannot promote staff to OWNER.");
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        ...(dto.role != null && { role: dto.role }),
        ...(dto.permissions != null && {
          permissions: this.permissionsToCsv(dto.permissions),
        }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
      include: {
        user: { select: { id: true, email: true, name: true, staffHandle: true } },
      },
    });

    if (dto.name != null) {
      await this.prisma.user.update({
        where: { id: membership.userId },
        data: { name: dto.name.trim() },
      });
    }

    await this.audit.record(actor, {
      section: "team",
      action: "staff.update",
      summary: `Updated employee ${updated.user.email}`,
      meta: {
        membershipId,
        role: updated.role,
        isActive: updated.isActive,
        permissions: updated.permissions,
      },
    });

    return {
      membershipId: updated.id,
      loginId: updated.user.email,
      username: updated.user.staffHandle,
      name: dto.name ?? updated.user.name,
      role: updated.role,
      permissions: updated.permissions,
      isActive: updated.isActive,
    };
  }

  async remove(actor: JwtAccessPayload, membershipId: string) {
    const shopId = this.assertShopContext(actor);
    if (actor.shopRole !== "OWNER") {
      throw new ForbiddenException("Only the venue owner can remove staff.");
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        shopId,
        user: { accountType: "VENUE_STAFF" },
      },
    });
    if (!membership) throw new NotFoundException("Staff member not found.");

    const user = await this.prisma.user.findUnique({
      where: { id: membership.userId },
      select: { email: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.membership.delete({ where: { id: membershipId } });
      await tx.user.delete({ where: { id: membership.userId } });
    });

    await this.audit.record(actor, {
      section: "team",
      action: "staff.remove",
      summary: `Removed employee ${user?.email ?? membershipId}`,
      meta: { membershipId, loginEmail: user?.email },
    });

    return { ok: true };
  }
}
