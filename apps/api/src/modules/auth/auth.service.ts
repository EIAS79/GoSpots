import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../../common/security/password";
import {
  generateRefreshTokenRaw,
  hashToken,
} from "../../common/security/token";
import { UserAccountType } from "@prisma/client";
import {
  isValidOwnerEmail,
  isVenueStaffLoginEmail,
  normalizeLoginIdentifier,
} from "../../common/venue-account";
import { addTrialEndDate } from "../../common/subscription-tier";
import {
  buildDashboardPath,
  generateDashboardKey,
  parseDashboardPath,
} from "../../common/dashboard-path";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LoginDto, RegisterDto } from "./dto/auth.dto";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface JwtAccessPayload {
  sub: string;          // user id
  sysRole: string;
  email: string;
  acct?: string;        // VENUE_OWNER | VENUE_STAFF
  sid?: string;         // auth session id (staff: single active session)
  // Active membership context (optional — picked first owned shop on login).
  shopId?: string;
  shopRole?: string;
  perms?: string;       // CSV
  tier?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ─── Registration ───────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const email = normalizeLoginIdentifier(dto.email);
    if (isVenueStaffLoginEmail(email)) {
      throw new BadRequestException(
        "Staff accounts are created by your venue owner — use your venue login ID to sign in.",
      );
    }
    if (!isValidOwnerEmail(email)) {
      throw new BadRequestException("Invalid email address.");
    }

    const pwError = validatePasswordStrength(dto.password);
    if (pwError) throw new BadRequestException(pwError);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email already registered.");

    const passwordHash = await hashPassword(dto.password);
    const slug = dto.shopSlug.toLowerCase();
    const slugTaken = await this.prisma.shop.findUnique({ where: { slug } });
    if (slugTaken) throw new ConflictException("Venue URL slug already taken.");

    const { user, shop } = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name ?? null,
          accountType: "VENUE_OWNER",
        },
      });
      const s = await tx.shop.create({
        data: {
          slug,
          dashboardKey: generateDashboardKey(),
          name: dto.shopName,
          ownerId: u.id,
          subscription: {
            create: {
              tier: "STARTER",
              status: "TRIAL",
              trialEndsAt: addTrialEndDate(),
            },
          },
        },
      });
      await tx.membership.create({
        data: {
          userId: u.id,
          shopId: s.id,
          role: "OWNER",
          permissions: "*",
          acceptedAt: new Date(),
          isActive: true,
        },
      });
      return { user: u, shop: s };
    });

    await this.notifications.seedWelcomeNotifications(
      shop.id,
      user.id,
      shop.name,
    );

    return user;
  }

  // ─── Login ───────────────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string, ua?: string) {
    const loginId = normalizeLoginIdentifier(dto.login);
    const user = await this.prisma.user.findUnique({
      where: { email: loginId },
    });
    if (!user) {
      // Constant-time fail
      await verifyPassword(
        "$argon2id$v=19$m=19456,t=2,p=1$invalidsalt$invalid",
        dto.password,
      );
      throw new UnauthorizedException("Invalid credentials.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        "Account locked. Try again later or reset your password.",
      );
    }

    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock =
        failed >= MAX_FAILED
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil: lock,
        },
      });
      throw new UnauthorizedException("Invalid credentials.");
    }

    const activeMembership = await this.prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (user.accountType === "VENUE_STAFF" && !activeMembership) {
      throw new UnauthorizedException("This staff account has been disabled.");
    }

    if (user.accountType === "VENUE_STAFF" && !user.passwordSetAt) {
      throw new UnauthorizedException(
        "This employee account is not activated yet. Use the personal setup link from your manager.",
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    const tokens = await this.issueTokens(user.id, ip, ua);
    await this.notifications.recordSignIn({
      userId: user.id,
      email: user.email,
      name: user.name,
      accountType: user.accountType,
      shopId: activeMembership?.shopId,
      shopRole: activeMembership?.role,
      ip,
    });
    return tokens;
  }

  /** Employee sets their own password once via invite link (anti–credential sharing). */
  async activateStaffInvite(
    token: string,
    password: string,
    ip?: string,
    ua?: string,
  ) {
    const pwError = validatePasswordStrength(password);
    if (pwError) throw new BadRequestException(pwError);

    const tokenHash = hashToken(token);
    const membership = await this.prisma.membership.findFirst({
      where: {
        inviteTokenHash: tokenHash,
        inviteExpiresAt: { gt: new Date() },
        user: {
          accountType: UserAccountType.VENUE_STAFF,
          passwordSetAt: null,
        },
      },
      include: { user: true },
    });
    if (!membership) {
      throw new BadRequestException(
        "Invalid or expired setup link. Ask your manager for a new one.",
      );
    }

    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: membership.userId },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      await tx.membership.update({
        where: { id: membership.id },
        data: {
          inviteTokenHash: null,
          inviteExpiresAt: null,
          acceptedAt: new Date(),
        },
      });
      await tx.authSession.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    const actor: JwtAccessPayload = {
      sub: membership.userId,
      sysRole: "USER",
      email: membership.user.email,
      shopId: membership.shopId,
      shopRole: "STAFF",
    };
    await this.audit.record(actor, {
      section: "team",
      action: "staff.activate",
      summary: `${membership.user.email} completed account setup`,
      meta: { membershipId: membership.id },
      ipAddress: ip,
    });

    await this.notifications.recordTeamEvent(membership.shopId, {
      title: "Employee activated account",
      body: `${membership.user.name ?? membership.user.email} completed setup and can sign in.`,
      href: "/staff",
    });

    return this.issueTokens(membership.userId, ip, ua);
  }

  // ─── Refresh token rotation ─────────────────────────────────────
  async refresh(refreshToken: string, ip?: string, ua?: string) {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.authSession.findFirst({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token invalid.");
    }
    // Rotate: revoke current, issue new
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(session.userId, ip, ua);
  }

  // ─── Logout — revoke current session ────────────────────────────
  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const tokenHash = hashToken(refreshToken);
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─── Profile + memberships for /me ──────────────────────────────
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        accountType: true,
        staffHandle: true,
        systemRole: true,
        emailVerified: true,
        memberships: {
          select: {
            id: true,
            role: true,
            permissions: true,
            isActive: true,
            shop: {
              select: {
                id: true,
                slug: true,
                dashboardKey: true,
                name: true,
                locale: true,
                currency: true,
                subscription: {
                  select: { tier: true, status: true, trialEndsAt: true },
                },
              },
            },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /** Ensures the signed-in user may access this private dashboard URL. */
  async verifyVenueDashboard(userId: string, sysRole: string, venuePath: string) {
    const parsed = parseDashboardPath(venuePath);
    if (!parsed) {
      throw new BadRequestException("Invalid venue dashboard path.");
    }

    const shop = await this.prisma.shop.findFirst({
      where: { slug: parsed.slug, dashboardKey: parsed.dashboardKey },
      select: {
        id: true,
        slug: true,
        dashboardKey: true,
        name: true,
        locale: true,
        currency: true,
        city: true,
        isPublished: true,
      },
    });
    if (!shop) {
      throw new UnauthorizedException("Venue not found or access denied.");
    }

    if (sysRole === "SUPER_ADMIN") {
      return { shop, membership: null };
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId, shopId: shop.id, isActive: true },
    });
    if (!membership) {
      throw new UnauthorizedException("You do not have access to this venue.");
    }

    return { shop, membership };
  }

  /** Re-issue access token scoped to the venue in the dashboard URL. */
  async bindVenueSession(
    actor: JwtAccessPayload,
    venuePath: string,
  ) {
    const { shop, membership } = await this.verifyVenueDashboard(
      actor.sub,
      actor.sysRole,
      venuePath,
    );

    const shopFull = await this.prisma.shop.findUnique({
      where: { id: shop.id },
      include: { subscription: true },
    });

    const accessTtl = +this.config.get("JWT_ACCESS_TTL", "900");
    const payload: JwtAccessPayload = {
      sub: actor.sub,
      sysRole: actor.sysRole,
      email: actor.email,
      acct: actor.acct,
      sid: actor.sid,
      shopId: shop.id,
      shopRole: membership?.role ?? "OWNER",
      perms: membership?.permissions ?? "*",
      tier: shopFull?.subscription?.tier,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
      expiresIn: accessTtl,
    });

    return { shop, accessToken, accessExpiresIn: accessTtl };
  }

  resolveDashboardPathForUser(user: {
    memberships: { isActive: boolean; role: string; shop: { slug: string; dashboardKey: string } }[];
  }): string | null {
    const active = user.memberships.filter((m) => m.isActive);
    const primary =
      active.find((m) => m.role === "OWNER") ?? active[0];
    if (!primary) return null;
    return buildDashboardPath(primary.shop.slug, primary.shop.dashboardKey);
  }

  // ─── Internal: build access + refresh tokens ────────────────────
  private async issueTokens(userId: string, ip?: string, ua?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { shop: { include: { subscription: true } } },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    if (user.accountType === UserAccountType.VENUE_STAFF) {
      await this.prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const activeMemberships = user.memberships.filter((m) => m.isActive);
    const primary =
      activeMemberships.find((m) => m.role === "OWNER") ??
      activeMemberships[0];
    const accessTtl = +this.config.get("JWT_ACCESS_TTL", "900");
    const refreshTtl = +this.config.get("JWT_REFRESH_TTL", "604800");

    const refreshRaw = generateRefreshTokenRaw();
    const refreshHash = hashToken(refreshRaw);

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        userAgent: ua?.slice(0, 200),
        ipAddress: ip?.slice(0, 64),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    const payload: JwtAccessPayload = {
      sub: user.id,
      sysRole: user.systemRole,
      email: user.email,
      acct: user.accountType,
      sid:
        user.accountType === UserAccountType.VENUE_STAFF
          ? session.id
          : undefined,
      shopId: primary?.shopId,
      shopRole: primary?.role,
      perms: primary?.permissions,
      tier: primary?.shop.subscription?.tier,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
      expiresIn: accessTtl,
    });

    const dashboardPath = this.resolveDashboardPathForUser({
      memberships: activeMemberships.map((m) => ({
        isActive: m.isActive,
        role: m.role,
        shop: {
          slug: m.shop.slug,
          dashboardKey: m.shop.dashboardKey,
        },
      })),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        systemRole: user.systemRole,
      },
      dashboardPath,
      accessToken,
      accessExpiresIn: accessTtl,
      refreshToken: refreshRaw,
      refreshExpiresIn: refreshTtl,
    };
  }
}
