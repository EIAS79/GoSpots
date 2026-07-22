import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from './auth.types';
export type { JwtAccessPayload } from './auth.types';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../../common/security/password';
import { generateRefreshTokenRaw, hashToken } from '../../common/security/token';
import { ShopRole, UserAccountType } from '@prisma/client';
import {
  isValidOwnerEmail,
  isVenueStaffLoginEmail,
  normalizeLoginIdentifier,
} from '../../common/venue-account';
import { addTrialEndDate, tierForPack } from '../../common/subscription-tier';
import {
  assertMultiVenueEntitlement,
  assertOwnerMayAddVenue,
  assertStaffSeatCapacity,
  getVenueEntitlements,
} from '../../common/venue-entitlements';
import {
  resolveAddOnsCsv,
  resolvePackId,
  serializeAddOns,
  syncSubscriptionAddOnRows,
  type AddOnId,
} from '../../common/venue-packs';
import {
  permissionsToEffectiveCsv,
  syncMembershipPermissionRows,
} from '../../common/permissions';
import {
  dashboardKeyPersistFields,
  generateDashboardKey,
} from '../../common/dashboard-path';
import {
  buildNewDeviceSignInMail,
  isNewDeviceUserAgent,
  normalizeSessionUserAgent,
} from '../../common/new-device-alert.util';
import {
  MFA_CHALLENGE_PURPOSE,
  MFA_CHALLENGE_TTL_SEC,
} from '../../common/mfa-challenge.util';
import {
  isStaffMfaOptInEnabled,
  isUserMfaLoginEligible,
  STAFF_MFA_PHASE1_ELIGIBLE_ROLES,
} from '../../common/staff-mfa.util';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AuthSessionService } from './auth-session.service';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthLogoutService } from './auth-logout.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthVenueService } from './auth-venue.service';
import { AuthMfaService } from './auth-mfa.service';
import {
  ForgotPasswordDto,
  LoginDto,
  MfaRecoveryRegenerateDto,
  MfaTotpBeginDto,
  MfaTotpConfirmDto,
  MfaTotpDisableDto,
  MfaVerifyDto,
  RegisterDto,
  ResetPasswordDto,
  StaffForgotPasswordDto,
} from './dto/auth.dto';
import { CreateVenueDto } from './dto/create-venue.dto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type AuthTokenBundle = {
  user: {
    id: string;
    email: string;
    name: string | null;
    systemRole: string;
  };
  venuePath: string | null;
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
};

/** Password OK but TOTP still required — no cookies issued yet. */
export type MfaLoginChallenge = {
  mfaRequired: true;
  mfaToken: string;
};

export type LoginResult = AuthTokenBundle | MfaLoginChallenge;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessions: AuthSessionService;
  private readonly refreshSvc: AuthRefreshService;
  private readonly logoutSvc: AuthLogoutService;
  private readonly passwordSvc: AuthPasswordService;
  private readonly venueSvc: AuthVenueService;
  private readonly mfaSvc: AuthMfaService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    // Bible #11 auth split: session API surface lives on AuthSessionService.
    // Optional so pre-existing unit specs that construct AuthService with the
    // legacy 6-arg signature keep working — we lazily wrap the same prisma.
    @Optional() sessions?: AuthSessionService,
    // Bible #14 auth split: refresh rotation lives on AuthRefreshService.
    // Optional for the same legacy 6-arg unit-spec constructor path.
    @Optional()
    @Inject(forwardRef(() => AuthRefreshService))
    refreshSvc?: AuthRefreshService,
    // Bible #14 auth split: logout revoke lives on AuthLogoutService.
    // Optional for the same legacy 6-arg unit-spec constructor path.
    @Optional() logoutSvc?: AuthLogoutService,
    // Bible #14 auth split: owner password reset lives on AuthPasswordService.
    // Optional for the same legacy 6-arg unit-spec constructor path.
    @Optional() passwordSvc?: AuthPasswordService,
    // Bible #14 auth split: venue dashboard bind lives on AuthVenueService.
    // Optional for the same legacy 6-arg unit-spec constructor path.
    @Optional() venueSvc?: AuthVenueService,
    // Bible #14 auth split: owner MFA lives on AuthMfaService.
    // Optional for the same legacy 6-arg unit-spec constructor path.
    @Optional()
    @Inject(forwardRef(() => AuthMfaService))
    mfaSvc?: AuthMfaService,
  ) {
    this.sessions = sessions ?? new AuthSessionService(prisma);
    this.refreshSvc = refreshSvc ?? new AuthRefreshService(prisma, this);
    this.logoutSvc = logoutSvc ?? new AuthLogoutService(prisma);
    this.passwordSvc =
      passwordSvc ??
      new AuthPasswordService(prisma, config, mail, notifications);
    this.venueSvc = venueSvc ?? new AuthVenueService(prisma, jwt, config);
    this.mfaSvc =
      mfaSvc ?? new AuthMfaService(prisma, jwt, config, mail, this);
  }

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
          ...dashboardKeyPersistFields(generateDashboardKey()),
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
        include: { subscription: true },
      });
      if (s.subscription) {
        await syncSubscriptionAddOnRows(tx, s.subscription.id, addOnsCsv);
      }
      const membership = await tx.membership.create({
        data: {
          userId: u.id,
          shopId: s.id,
          role: 'OWNER',
          acceptedAt: new Date(),
          isActive: true,
        },
      });
      await syncMembershipPermissionRows(tx, membership.id, '*');
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
          ...dashboardKeyPersistFields(generateDashboardKey()),
          name: dto.shopName,
          ownerId: userId,
          venueType: dto.venueType ?? packId,
          subscription: {
            create: {
              tier,
              status: 'TRIAL',
              trialEndsAt: addTrialEndDate(),
              packId,
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
          name: true,
          subscription: { select: { id: true } },
        },
      });
      if (s.subscription) {
        await syncSubscriptionAddOnRows(tx, s.subscription.id, addOnsCsv);
      }
      const membership = await tx.membership.create({
        data: {
          userId,
          shopId: s.id,
          role: 'OWNER',
          acceptedAt: new Date(),
          isActive: true,
        },
      });
      await syncMembershipPermissionRows(tx, membership.id, '*');
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
      shop: { id: shop.id, slug: shop.slug, name: shop.name },
      venuePath: shop.slug,
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
      select: {
        id: true,
        slug: true,
        name: true,
        subscription: {
          include: { addOnRows: true },
        },
      },
    });
    if (shops.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more venues are invalid or not owned by that email.',
      );
    }

    const currentMemberships = await this.prisma.membership.count({
      where: { userId: currentUserId, isActive: true },
    });
    const ownedSubs = await this.prisma.shop.findMany({
      where: { ownerId: currentUserId },
      select: { subscription: { include: { addOnRows: true } } },
    });
    assertMultiVenueEntitlement(
      [
        ...ownedSubs.map((s) => s.subscription),
        ...shops.map((s) => s.subscription),
      ],
      currentMemberships,
      shops.length,
    );

    const linked: { id: string; name: string; venuePath: string }[] = [];

    for (const shop of shops) {
      const membership = await this.prisma.membership.upsert({
        where: {
          userId_shopId: { userId: currentUserId, shopId: shop.id },
        },
        create: {
          userId: currentUserId,
          shopId: shop.id,
          role: 'OWNER',
          acceptedAt: new Date(),
          isActive: true,
        },
        update: {
          role: 'OWNER',
          isActive: true,
          acceptedAt: new Date(),
        },
      });
      await syncMembershipPermissionRows(this.prisma, membership.id, '*');

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
        venuePath: shop.slug,
      });
    }

    return {
      linked,
      venuePath: linked[0]?.venuePath ?? null,
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
  async login(dto: LoginDto, ip?: string, ua?: string): Promise<LoginResult> {
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
        'Staff sign-in needs your login ID (name@venue.locora).',
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

    // TOTP: password OK but do not issue cookies until MFA verify.
    let staffMfaMembershipRoles: ShopRole[] | undefined;
    if (
      user.accountType === UserAccountType.VENUE_STAFF &&
      user.totpEnabled &&
      isStaffMfaOptInEnabled({
        STAFF_MFA_OPT_IN: this.config.get<string>('STAFF_MFA_OPT_IN'),
      })
    ) {
      const eligibleMemberships = await this.prisma.membership.findMany({
        where: {
          userId: user.id,
          isActive: true,
          role: { in: [...STAFF_MFA_PHASE1_ELIGIBLE_ROLES] },
        },
        select: { role: true },
      });
      staffMfaMembershipRoles = eligibleMemberships.map((m) => m.role);
    }

    if (
      isUserMfaLoginEligible({
        accountType: user.accountType,
        totpEnabled: user.totpEnabled,
        staffMembershipRoles: staffMfaMembershipRoles,
        staffMfaOptIn: isStaffMfaOptInEnabled({
          STAFF_MFA_OPT_IN: this.config.get<string>('STAFF_MFA_OPT_IN'),
        }),
      })
    ) {
      const mfaToken = await this.jwt.signAsync(
        {
          sub: user.id,
          purpose: MFA_CHALLENGE_PURPOSE,
          acct: user.accountType,
        },
        {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: MFA_CHALLENGE_TTL_SEC,
        },
      );
      return { mfaRequired: true, mfaToken };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    return this.completeLoginAfterPassword(user.id, ip, ua);
  }

  /** Finish login after password (and MFA when enabled). */
  private async completeLoginAfterPassword(
    userId: string,
    ip?: string,
    ua?: string,
  ): Promise<AuthTokenBundle> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        accountType: true,
      },
    });
    if (!user) throw new UnauthorizedException();

    const activeMembership = await this.prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
    });

    // Snapshot active UAs before issueTokens (staff may revoke peers inside).
    const priorSessions = await this.prisma.authSession.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { userAgent: true },
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
    await this.maybeNotifyNewDeviceSignIn({
      userId: user.id,
      email: user.email,
      userAgent: ua,
      shopId: activeMembership?.shopId,
      knownUserAgents: priorSessions.map((s) => s.userAgent),
    });
    return tokens;
  }

  // ─── Owner TOTP MFA (facade → AuthMfaService, Bible #14) ────────
  /** @see AuthMfaService.getMfaStatus */
  async getMfaStatus(userId: string) {
    return this.mfaSvc.getMfaStatus(userId);
  }

  /** @see AuthMfaService.beginMfaTotp */
  async beginMfaTotp(userId: string, dto: MfaTotpBeginDto) {
    return this.mfaSvc.beginMfaTotp(userId, dto);
  }

  /** @see AuthMfaService.confirmMfaTotp */
  async confirmMfaTotp(userId: string, dto: MfaTotpConfirmDto) {
    return this.mfaSvc.confirmMfaTotp(userId, dto);
  }

  /** @see AuthMfaService.disableMfaTotp */
  async disableMfaTotp(userId: string, dto: MfaTotpDisableDto) {
    return this.mfaSvc.disableMfaTotp(userId, dto);
  }

  /** @see AuthMfaService.regenerateMfaRecoveryCodes */
  async regenerateMfaRecoveryCodes(
    userId: string,
    dto: MfaRecoveryRegenerateDto,
  ) {
    return this.mfaSvc.regenerateMfaRecoveryCodes(userId, dto);
  }

  /** @see AuthMfaService.verifyMfaLogin */
  async verifyMfaLogin(
    dto: MfaVerifyDto,
    ip?: string,
    ua?: string,
  ): Promise<AuthTokenBundle> {
    return this.mfaSvc.verifyMfaLogin(dto, ip, ua);
  }

  /**
   * Wire hook for AuthMfaService DI factory (Bible #14). Not for controllers.
   * Login completion stays here because password login shares this path.
   */
  mfaCompleteLogin(
    userId: string,
    ip?: string,
    ua?: string,
  ): Promise<AuthTokenBundle> {
    return this.completeLoginAfterPassword(userId, ip, ua);
  }

  // ─── Password reset (facade → AuthPasswordService, Bible #14) ───
  /** @see AuthPasswordService.requestOwnerPasswordReset */
  async requestOwnerPasswordReset(dto: ForgotPasswordDto) {
    return this.passwordSvc.requestOwnerPasswordReset(dto);
  }

  /** @see AuthPasswordService.resetOwnerPassword */
  async resetOwnerPassword(dto: ResetPasswordDto) {
    return this.passwordSvc.resetOwnerPassword(dto);
  }

  /** @see AuthPasswordService.requestStaffPasswordReset */
  async requestStaffPasswordReset(dto: StaffForgotPasswordDto) {
    return this.passwordSvc.requestStaffPasswordReset(dto);
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

    const tokenHash = hashToken(token.trim());
    const invalidMsg =
      'Invalid or expired setup link. Ask your manager for a new one.';
    const passwordHash = await hashPassword(password);

    const membership = await this.prisma.$transaction(async (tx) => {
      const found = await tx.membership.findFirst({
        where: {
          inviteTokenHash: tokenHash,
          inviteExpiresAt: { gt: new Date() },
          isActive: true,
          user: {
            accountType: UserAccountType.VENUE_STAFF,
            passwordSetAt: null,
          },
        },
        include: { user: true },
      });
      if (!found) {
        throw new BadRequestException(invalidMsg);
      }

      // Pending invites already consume an active seat — assert as "keep this
      // seat" (used - 1), not adding another.
      const shop = await tx.shop.findUnique({
        where: { id: found.shopId },
        include: {
          subscription: { include: { addOnRows: true } },
        },
      });
      const entitlements = getVenueEntitlements(shop?.subscription ?? null);
      const usedSeats = await tx.membership.count({
        where: {
          shopId: found.shopId,
          role: { in: [ShopRole.STAFF, ShopRole.MANAGER] },
          isActive: true,
          user: { accountType: UserAccountType.VENUE_STAFF },
        },
      });
      assertStaffSeatCapacity(entitlements, Math.max(0, usedSeats - 1));

      // Atomic consume: passwordSetAt null + invite hash must both still match.
      const activated = await tx.user.updateMany({
        where: {
          id: found.userId,
          accountType: UserAccountType.VENUE_STAFF,
          passwordSetAt: null,
        },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      if (activated.count !== 1) {
        throw new BadRequestException(invalidMsg);
      }

      const consumed = await tx.membership.updateMany({
        where: {
          id: found.id,
          inviteTokenHash: tokenHash,
          inviteExpiresAt: { gt: new Date() },
          isActive: true,
        },
        data: {
          inviteTokenHash: null,
          inviteExpiresAt: null,
          passwordResetRequestedAt: null,
          acceptedAt: new Date(),
        },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(invalidMsg);
      }

      // Rows already written at invite create; no CSV dual-write on activate.

      await tx.authSession.updateMany({
        where: { userId: found.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return found;
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

  // ─── Refresh token rotation (facade → AuthRefreshService, Bible #14) ───
  /** @see AuthRefreshService.refresh */
  async refresh(refreshToken: string, ip?: string, ua?: string) {
    return this.refreshSvc.refresh(refreshToken, ip, ua);
  }

  /**
   * Wire hook for AuthRefreshService DI factory (Bible #14). Not for controllers.
   * Token issuance stays here because login / activate share `issueTokens`.
   */
  refreshIssueTokens(
    userId: string,
    ip?: string,
    ua?: string,
    familyId?: string,
  ): Promise<AuthTokenBundle> {
    return this.issueTokens(userId, ip, ua, familyId);
  }

  // ─── Logout (facade → AuthLogoutService, Bible #14) ─────────────
  /** @see AuthLogoutService.logout */
  async logout(refreshToken?: string) {
    return this.logoutSvc.logout(refreshToken);
  }

  // ─── Session API surface (facade → AuthSessionService, Bible #11) ────
  /** @see AuthSessionService.listAuthSessions */
  async listAuthSessions(userId: string) {
    return this.sessions.listAuthSessions(userId);
  }

  /** @see AuthSessionService.revokeAuthSession */
  async revokeAuthSession(userId: string, sessionId: string) {
    return this.sessions.revokeAuthSession(userId, sessionId);
  }

  /** @see AuthSessionService.revokeOtherAuthSessions */
  async revokeOtherAuthSessions(
    userId: string,
    opts: { refreshToken?: string; sessionId?: string } = {},
  ) {
    return this.sessions.revokeOtherAuthSessions(userId, opts);
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
            permissionRows: { select: { permission: true } },
            isActive: true,
            shop: {
              select: {
                id: true,
                slug: true,
                name: true,
                locale: true,
                currency: true,
                subscription: {
                  select: {
                    tier: true,
                    status: true,
                    trialEndsAt: true,
                    packId: true,
                    addOnRows: { select: { addOnId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    // Rows-primary: response keeps legacy string fields (computed from join rows).
    // Never emit Shop.dashboardKey — clients bind with public slug (rotate has its own API).
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      accountType: user.accountType,
      staffHandle: user.staffHandle,
      systemRole: user.systemRole,
      emailVerified: user.emailVerified,
      memberships: user.memberships.map((m) => {
        const sub = m.shop.subscription;
        return {
          id: m.id,
          role: m.role,
          permissions: permissionsToEffectiveCsv({
            permissionRows: m.permissionRows,
          }),
          isActive: m.isActive,
          shop: {
            id: m.shop.id,
            slug: m.shop.slug,
            name: m.shop.name,
            locale: m.shop.locale,
            currency: m.shop.currency,
            subscription: sub
              ? {
                  tier: sub.tier,
                  status: sub.status,
                  trialEndsAt: sub.trialEndsAt,
                  packId: sub.packId,
                  addOns: resolveAddOnsCsv({
                    addOnRows: sub.addOnRows,
                  }),
                }
              : null,
          },
        };
      }),
    };
  }

  // ─── Venue dashboard (facade → AuthVenueService, Bible #14) ─────
  /** @see AuthVenueService.verifyVenueDashboard */
  async verifyVenueDashboard(
    userId: string,
    sysRole: string,
    venuePath: string,
  ) {
    return this.venueSvc.verifyVenueDashboard(userId, sysRole, venuePath);
  }

  /** @see AuthVenueService.bindVenueSession */
  async bindVenueSession(actor: JwtAccessPayload, venuePath: string) {
    return this.venueSvc.bindVenueSession(actor, venuePath);
  }

  /** @see AuthVenueService.resolveVenuePathForUser */
  resolveVenuePathForUser(user: {
    memberships: {
      isActive: boolean;
      role: string;
      shop: { slug: string };
    }[];
  }): string | null {
    return this.venueSvc.resolveVenuePathForUser(user);
  }

  /**
   * Email owner/staff on new UA (or first active session). Fail-open:
   * MailService enqueues outbox first; delivery errors must not fail login.
   */
  private async maybeNotifyNewDeviceSignIn(input: {
    userId: string;
    email: string;
    userAgent?: string;
    shopId?: string;
    knownUserAgents: Array<string | null>;
  }): Promise<void> {
    if (!isNewDeviceUserAgent(input.userAgent, input.knownUserAgents)) {
      return;
    }
    const signedInAt = new Date();
    const body = buildNewDeviceSignInMail({
      userAgent: normalizeSessionUserAgent(input.userAgent),
      signedInAt,
    });
    try {
      await this.mail.send({
        to: input.email,
        subject: body.subject,
        text: body.text,
        html: body.html,
        shopId: input.shopId,
        required: false,
      });
    } catch (err) {
      this.logger.warn(
        `New-device sign-in email failed for user=${input.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ─── Internal: build access + refresh tokens ────────────────────
  private async issueTokens(
    userId: string,
    ip?: string,
    ua?: string,
    familyId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            permissionRows: { select: { permission: true } },
            shop: { include: { subscription: true } },
          },
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
    const sessionFamilyId = familyId ?? randomUUID();

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        familyId: sessionFamilyId,
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
      perms: primary
        ? permissionsToEffectiveCsv({
            permissionRows: primary.permissionRows,
          })
        : undefined,
      tier: primary?.shop.subscription?.tier,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const venuePath = this.venueSvc.resolveVenuePathForUser({
      memberships: activeMemberships.map((m) => ({
        isActive: m.isActive,
        role: m.role,
        shop: { slug: m.shop.slug },
      })),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        systemRole: user.systemRole,
      },
      venuePath,
      accessToken,
      accessExpiresIn: accessTtl,
      refreshToken: refreshRaw,
      refreshExpiresIn: refreshTtl,
    };
  }
}
