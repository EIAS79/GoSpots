import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../../common/security/password';
import {
  generatePasswordResetToken,
  generateRefreshTokenRaw,
  hashToken,
  PASSWORD_RESET_TTL_MS,
} from '../../common/security/token';
import { ShopRole, UserAccountType } from '@prisma/client';
import {
  isValidOwnerEmail,
  isVenueStaffLoginEmail,
  normalizeLoginIdentifier,
} from '../../common/venue-account';
import { addTrialEndDate, tierForPack } from '../../common/subscription-tier';
import {
  resolvePackId,
  serializeAddOns,
  type AddOnId,
} from '../../common/venue-packs';
import {
  buildDashboardPath,
  generateDashboardKey,
  parseDashboardPath,
} from '../../common/dashboard-path';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  StaffForgotPasswordDto,
} from './dto/auth.dto';
import { CreateVenueDto } from './dto/create-venue.dto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface JwtAccessPayload {
  sub: string; // user id
  sysRole: string;
  email: string;
  acct?: string; // VENUE_OWNER | VENUE_STAFF
  sid?: string; // auth session id (staff: single active session)
  // Active membership context (optional — picked first owned shop on login).
  shopId?: string;
  shopRole?: string;
  perms?: string; // CSV
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
    private readonly mail: MailService,
  ) {}

  // ─── Registration ───────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const email = normalizeLoginIdentifier(dto.email);
    if (isVenueStaffLoginEmail(email)) {
      throw new BadRequestException(
        'Staff accounts are created by your venue owner — use your venue login ID to sign in.',
      );
    }
    if (!isValidOwnerEmail(email)) {
      throw new BadRequestException('Invalid email address.');
    }

    const pwError = validatePasswordStrength(dto.password);
    if (pwError) throw new BadRequestException(pwError);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered.');

    const passwordHash = await hashPassword(dto.password);
    const slug = dto.shopSlug.toLowerCase();
    const slugTaken = await this.prisma.shop.findUnique({ where: { slug } });
    if (slugTaken) throw new ConflictException('Venue URL slug already taken.');

    const packId = resolvePackId(dto.packId);
    const addOnsCsv = serializeAddOns((dto.addOns ?? []) as AddOnId[]);
    const tier = tierForPack(packId, addOnsCsv);

    const { user, shop } = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name ?? null,
          accountType: 'VENUE_OWNER',
        },
      });
      const s = await tx.shop.create({
        data: {
          slug,
          dashboardKey: generateDashboardKey(),
          name: dto.shopName,
          ownerId: u.id,
          venueType: dto.venueType ?? packId,
          city: dto.city?.trim() || null,
          country: dto.country?.trim() || null,
          phone: dto.phone?.trim() || null,
          subscription: {
            create: {
              tier,
              status: 'TRIAL',
              trialEndsAt: addTrialEndDate(),
              packId,
              addOns: addOnsCsv,
            },
          },
          /** Persist the same defaults the hours page shows, so public pages
           *  have real data before the owner customizes the schedule. */
          openingHours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
              weekday,
              opensAt: '09:00',
              closesAt: '22:00',
              isClosed: weekday === 0,
            })),
          },
        },
      });
      await tx.membership.create({
        data: {
          userId: u.id,
          shopId: s.id,
          role: 'OWNER',
          permissions: '*',
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

    await this.audit.recordForShop(shop.id, {
      section: 'subscription',
      action: 'subscription.trial_start',
      summary: `${packId} pack trial started (90 days)`,
      meta: { tier, status: 'TRIAL', packId, addOns: addOnsCsv },
      actorName: 'System',
    });

    return user;
  }

  /** Owner adds another venue under the same account. */
  async createVenueForOwner(userId: string, dto: CreateVenueDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountType: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.accountType !== 'VENUE_OWNER') {
      throw new ForbiddenException(
        'Only venue owners can create additional venues.',
      );
    }

    const slug = dto.shopSlug.toLowerCase();
    const slugTaken = await this.prisma.shop.findUnique({ where: { slug } });
    if (slugTaken) throw new ConflictException('Venue URL slug already taken.');

    const packId = resolvePackId(dto.packId);
    const addOnsCsv = serializeAddOns((dto.addOns ?? []) as AddOnId[]);
    const tier = tierForPack(packId, addOnsCsv);

    const shop = await this.prisma.$transaction(async (tx) => {
      const s = await tx.shop.create({
        data: {
          slug,
          dashboardKey: generateDashboardKey(),
          name: dto.shopName,
          ownerId: userId,
          venueType: dto.venueType ?? packId,
          subscription: {
            create: {
              tier,
              status: 'TRIAL',
              trialEndsAt: addTrialEndDate(),
              packId,
              addOns: addOnsCsv,
            },
          },
          openingHours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
              weekday,
              opensAt: '09:00',
              closesAt: '22:00',
              isClosed: weekday === 0,
            })),
          },
        },
        select: {
          id: true,
          slug: true,
          dashboardKey: true,
          name: true,
        },
      });
      await tx.membership.create({
        data: {
          userId,
          shopId: s.id,
          role: 'OWNER',
          permissions: '*',
          acceptedAt: new Date(),
          isActive: true,
        },
      });
      return s;
    });

    await this.notifications.seedWelcomeNotifications(
      shop.id,
      userId,
      shop.name,
    );

    await this.audit.recordForShop(shop.id, {
      section: 'subscription',
      action: 'subscription.trial_start',
      summary: `${packId} pack trial started (90 days)`,
      meta: { tier, status: 'TRIAL', packId, addOns: addOnsCsv },
      actorName: 'System',
    });

    return {
      shop,
      dashboardPath: buildDashboardPath(shop.slug, shop.dashboardKey),
    };
  }

  /**
   * Verify another owner email+password and list their venues that are not
   * yet on the current account (for Link existing).
   */
  async previewLinkVenuesByEmail(
    currentUserId: string,
    email: string,
    password: string,
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, accountType: true },
    });
    if (!current || current.accountType !== 'VENUE_OWNER') {
      throw new ForbiddenException('Only venue owners can link venues.');
    }

    const source = await this.verifyOwnerCredentials(email, password);
    const owned = await this.prisma.shop.findMany({
      where: { ownerId: source.id },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        country: true,
        displayName: true,
      },
      orderBy: { name: 'asc' },
    });

    const existing = await this.prisma.membership.findMany({
      where: { userId: currentUserId, shopId: { in: owned.map((s) => s.id) } },
      select: { shopId: true, isActive: true },
    });
    const already = new Set(
      existing.filter((m) => m.isActive).map((m) => m.shopId),
    );

    const venues = owned
      .filter((s) => !already.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.displayName?.trim() || s.name,
        slug: s.slug,
        city: s.city,
        country: s.country,
      }));

    return {
      email: source.email,
      sameAccount: source.id === currentUserId,
      venues,
      message:
        venues.length === 0
          ? 'No additional venues to link — they may already be on this account.'
          : undefined,
    };
  }

  /** After password verify: add OWNER memberships for selected shops. */
  async linkVenuesByEmail(
    currentUserId: string,
    email: string,
    password: string,
    shopIds: string[],
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, accountType: true, name: true },
    });
    if (!current || current.accountType !== 'VENUE_OWNER') {
      throw new ForbiddenException('Only venue owners can link venues.');
    }

    const source = await this.verifyOwnerCredentials(email, password);
    const uniqueIds = [...new Set(shopIds.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      throw new BadRequestException('Select at least one venue to link.');
    }

    const shops = await this.prisma.shop.findMany({
      where: { id: { in: uniqueIds }, ownerId: source.id },
      select: { id: true, slug: true, dashboardKey: true, name: true },
    });
    if (shops.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more venues are invalid or not owned by that email.',
      );
    }

    const linked: { id: string; name: string; dashboardPath: string }[] = [];

    for (const shop of shops) {
      await this.prisma.membership.upsert({
        where: {
          userId_shopId: { userId: currentUserId, shopId: shop.id },
        },
        create: {
          userId: currentUserId,
          shopId: shop.id,
          role: 'OWNER',
          permissions: '*',
          acceptedAt: new Date(),
          isActive: true,
        },
        update: {
          role: 'OWNER',
          permissions: '*',
          isActive: true,
          acceptedAt: new Date(),
        },
      });

      await this.audit.recordForShop(shop.id, {
        section: 'venue',
        action: 'venue.link_by_email',
        summary: `Venue linked to account via email verification`,
        meta: {
          linkedUserId: currentUserId,
          sourceOwnerId: source.id,
          email: source.email,
        },
        actorName: current.name ?? 'Owner',
      });

      linked.push({
        id: shop.id,
        name: shop.name,
        dashboardPath: buildDashboardPath(shop.slug, shop.dashboardKey),
      });
    }

    return {
      linked,
      dashboardPath: linked[0]?.dashboardPath ?? null,
    };
  }

  private async verifyOwnerCredentials(email: string, password: string) {
    const loginId = normalizeLoginIdentifier(email);
    if (!isValidOwnerEmail(loginId)) {
      throw new BadRequestException('Enter a valid owner email address.');
    }
    const user = await this.prisma.user.findUnique({
      where: { email: loginId },
    });
    if (!user || user.accountType !== 'VENUE_OWNER') {
      await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$invalidsalt$invalid',
        password,
      );
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('That account is temporarily locked.');
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }
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
        '$argon2id$v=19$m=19456,t=2,p=1$invalidsalt$invalid',
        dto.password,
      );
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (dto.accountType && user.accountType !== dto.accountType) {
      await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$invalidsalt$invalid',
        dto.password,
      );
      if (dto.accountType === 'VENUE_OWNER') {
        throw new UnauthorizedException(
          'This login is for staff. Switch to the Staff panel.',
        );
      }
      throw new UnauthorizedException(
        'This login is for a venue owner. Switch to the Owner panel.',
      );
    }

    if (dto.accountType === 'VENUE_OWNER' && isVenueStaffLoginEmail(loginId)) {
      throw new BadRequestException(
        'Owner sign-in needs your real email — not a staff login ID.',
      );
    }

    if (
      dto.accountType === 'VENUE_STAFF' &&
      !isVenueStaffLoginEmail(loginId)
    ) {
      throw new BadRequestException(
        'Staff sign-in needs your login ID (name@venue.gospots).',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        user.accountType === 'VENUE_OWNER'
          ? 'Account locked. Try again later or reset your password.'
          : 'Account locked. Ask your venue owner to help unlock it.',
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
      throw new UnauthorizedException('Invalid credentials.');
    }

    const activeMembership = await this.prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (user.accountType === 'VENUE_STAFF' && !activeMembership) {
      throw new UnauthorizedException('This staff account has been disabled.');
    }

    if (user.accountType === 'VENUE_STAFF' && !user.passwordSetAt) {
      throw new UnauthorizedException(
        'This employee account is not activated yet. Use the personal setup link from your manager.',
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

  /**
   * Owner-only password reset request. Always returns the same message
   * (no email enumeration). Staff accounts are never reset this way.
   */
  async requestOwnerPasswordReset(dto: ForgotPasswordDto) {
    const email = normalizeLoginIdentifier(dto.email);
    const generic = {
      ok: true as const,
      message:
        'If that email belongs to a venue owner account, we sent a reset link. Staff cannot reset passwords here — ask your owner.',
    };

    if (!isValidOwnerEmail(email) || isVenueStaffLoginEmail(email)) {
      return generic;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.accountType !== 'VENUE_OWNER') {
      return generic;
    }

    const raw = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashToken(raw),
        passwordResetExpiresAt: expiresAt,
      },
    });

    const webOrigin =
      this.config.get<string>('WEB_APP_URL') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3000';
    const resetUrl = `${webOrigin}/reset-password?token=${encodeURIComponent(raw)}`;

    await this.mail.send({
      to: email,
      subject: 'Reset your GoSpots owner password',
      text: `Reset your password (valid ~1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Reset your GoSpots owner password (link valid about 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
      required: true,
    });

    return generic;
  }

  async resetOwnerPassword(dto: ResetPasswordDto) {
    const pwError = validatePasswordStrength(dto.password);
    if (pwError) throw new BadRequestException(pwError);

    const tokenHash = hashToken(dto.token.trim());
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
        accountType: 'VENUE_OWNER',
      },
    });
    if (!user) {
      throw new BadRequestException(
        'This reset link is invalid or expired. Request a new one from the owner sign-in panel.',
      );
    }

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    await this.prisma.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { ok: true as const };
  }

  /**
   * Staff forgot-password: match venue/owner name + login ID, flag membership,
   * notify owner. Always returns a generic message (no enumeration).
   * Owner generates a new /staff/activate link from Employee accounts.
   */
  async requestStaffPasswordReset(dto: StaffForgotPasswordDto) {
    const generic = {
      ok: true as const,
      message:
        'If that matches a staff account, your venue owner was notified. They will send you a new password setup link (WhatsApp, SMS, etc.).',
    };

    const loginId = normalizeLoginIdentifier(dto.loginId);
    const venueName = dto.venueName.trim().toLowerCase();
    if (!venueName || !isVenueStaffLoginEmail(loginId)) {
      return generic;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: loginId },
      include: {
        memberships: {
          where: {
            isActive: true,
            role: { in: [ShopRole.STAFF, ShopRole.MANAGER] },
          },
          include: {
            shop: {
              select: {
                id: true,
                name: true,
                displayName: true,
                owner: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (
      !user ||
      user.accountType !== UserAccountType.VENUE_STAFF ||
      !user.passwordSetAt
    ) {
      return generic;
    }

    const membership = user.memberships.find((m) => {
      const names = [
        m.shop.name,
        m.shop.displayName,
        m.shop.owner.name,
      ]
        .filter(Boolean)
        .map((n) => n!.trim().toLowerCase());
      return names.some((n) => n === venueName);
    });

    if (!membership) {
      return generic;
    }

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { passwordResetRequestedAt: new Date() },
    });

    const label =
      user.name?.trim() || user.staffHandle || user.email.split('@')[0];

    await this.notifications.recordTeamEvent(membership.shopId, {
      title: 'Staff forgot password',
      body: `${label} (${user.email}) asked for a new password link. Open Employee accounts to generate one and send it to them.`,
      href: '/staff',
      dedupeKey: `staff_pw_reset_${membership.id}`,
    });

    return generic;
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
        'Invalid or expired setup link. Ask your manager for a new one.',
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
          passwordResetRequestedAt: null,
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
      sysRole: 'USER',
      email: membership.user.email,
      shopId: membership.shopId,
      shopRole: 'STAFF',
    };
    await this.audit.record(actor, {
      section: 'team',
      action: 'staff.activate',
      summary: `${membership.user.email} completed account setup`,
      meta: { membershipId: membership.id },
      ipAddress: ip,
    });

    await this.notifications.recordTeamEvent(membership.shopId, {
      title: 'Employee activated account',
      body: `${membership.user.name ?? membership.user.email} completed setup and can sign in.`,
      href: '/staff',
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
      throw new UnauthorizedException('Refresh token invalid.');
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
                  select: {
                    tier: true,
                    status: true,
                    trialEndsAt: true,
                    packId: true,
                    addOns: true,
                  },
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
  async verifyVenueDashboard(
    userId: string,
    sysRole: string,
    venuePath: string,
  ) {
    const parsed = parseDashboardPath(venuePath);
    if (!parsed) {
      throw new BadRequestException('Invalid venue dashboard path.');
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
      throw new UnauthorizedException('Venue not found or access denied.');
    }

    if (sysRole === 'SUPER_ADMIN') {
      return { shop, membership: null };
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId, shopId: shop.id, isActive: true },
    });
    if (!membership) {
      throw new UnauthorizedException('You do not have access to this venue.');
    }

    return { shop, membership };
  }

  /** Re-issue access token scoped to the venue in the dashboard URL. */
  async bindVenueSession(actor: JwtAccessPayload, venuePath: string) {
    const { shop, membership } = await this.verifyVenueDashboard(
      actor.sub,
      actor.sysRole,
      venuePath,
    );

    const shopFull = await this.prisma.shop.findUnique({
      where: { id: shop.id },
      include: { subscription: true },
    });

    const shopProfile = await this.prisma.shop.findUnique({
      where: { id: shop.id },
      select: {
        id: true,
        name: true,
        displayName: true,
        slug: true,
        description: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        coverImage: true,
        locale: true,
        currency: true,
        isPublished: true,
        floorCount: true,
      },
    });
    if (!shopProfile) {
      throw new UnauthorizedException('Venue not found or access denied.');
    }

    const accessTtl = +this.config.get('JWT_ACCESS_TTL', '900');
    const payload: JwtAccessPayload = {
      sub: actor.sub,
      sysRole: actor.sysRole,
      email: actor.email,
      acct: actor.acct,
      sid: actor.sid,
      shopId: shop.id,
      shopRole: membership?.role ?? 'OWNER',
      perms: membership?.permissions ?? '*',
      tier: shopFull?.subscription?.tier,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    return { shop: shopProfile, accessToken, accessExpiresIn: accessTtl };
  }

  resolveDashboardPathForUser(user: {
    memberships: {
      isActive: boolean;
      role: string;
      shop: { slug: string; dashboardKey: string };
    }[];
  }): string | null {
    const active = user.memberships.filter((m) => m.isActive);
    const primary = active.find((m) => m.role === 'OWNER') ?? active[0];
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
      activeMemberships.find((m) => m.role === 'OWNER') ?? activeMemberships[0];
    const accessTtl = +this.config.get('JWT_ACCESS_TTL', '900');
    const refreshTtl = +this.config.get('JWT_REFRESH_TTL', '604800');

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
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
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
