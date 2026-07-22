import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
  classifyVenuePath,
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
  isMfaChallengePayload,
} from '../../common/mfa-challenge.util';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  matchRecoveryCodeHash,
} from '../../common/mfa-recovery.util';
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
  type MfaEncryptionKeySource,
} from '../../common/mfa-totp.util';
import { assertUserPassword } from '../../common/security/verify-password.util';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
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

    // Owner TOTP: password OK but do not issue cookies until MFA verify.
    if (
      user.accountType === UserAccountType.VENUE_OWNER &&
      user.totpEnabled
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

  // ─── Owner TOTP MFA ──────────────────────────────────────────────

  private mfaKeySource(): MfaEncryptionKeySource {
    return {
      mfaTotpEncryptionKey: this.config.get<string>('MFA_TOTP_ENCRYPTION_KEY'),
      jwtAccessSecret: this.config.get<string>('JWT_ACCESS_SECRET'),
    };
  }

  private assertVenueOwner(accountType: UserAccountType) {
    if (accountType !== UserAccountType.VENUE_OWNER) {
      throw new ForbiddenException('Two-factor authentication is owner-only.');
    }
  }

  async getMfaStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true, totpEnabled: true },
    });
    if (!user) throw new UnauthorizedException();
    this.assertVenueOwner(user.accountType);
    const recoveryCodesRemaining = user.totpEnabled
      ? await this.prisma.mfaRecoveryCode.count({
          where: { userId, usedAt: null },
        })
      : 0;
    return {
      totpEnabled: user.totpEnabled,
      recoveryCodesRemaining,
    };
  }

  async beginMfaTotp(userId: string, dto: MfaTotpBeginDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        accountType: true,
        totpEnabled: true,
        passwordHash: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    this.assertVenueOwner(user.accountType);
    if (user.totpEnabled) {
      throw new BadRequestException('MFA is already enabled.');
    }
    await assertUserPassword(this.prisma, userId, dto.password);

    const secret = generateTotpSecret();
    const totpSecretEnc = encryptTotpSecret(secret, this.mfaKeySource());
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc, totpVerifiedAt: null },
    });

    return {
      secret,
      otpauthUri: buildOtpAuthUri({
        secret,
        accountName: user.email,
        issuer: 'Locora',
      }),
    };
  }

  async confirmMfaTotp(userId: string, dto: MfaTotpConfirmDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountType: true,
        totpEnabled: true,
        totpSecretEnc: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    this.assertVenueOwner(user.accountType);
    if (user.totpEnabled) {
      throw new BadRequestException('MFA is already enabled.');
    }
    if (!user.totpSecretEnc) {
      throw new BadRequestException('Start MFA enrollment first.');
    }

    let plaintext: string;
    try {
      plaintext = decryptTotpSecret(user.totpSecretEnc, this.mfaKeySource());
    } catch {
      throw new BadRequestException('MFA enrollment secret is invalid. Start again.');
    }
    if (!verifyTotpCode(plaintext, dto.code)) {
      throw new UnauthorizedException('Invalid authenticator code.');
    }

    const recoveryCodes = generateRecoveryCodes();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId,
          codeHash: hashRecoveryCode(code),
        })),
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          totpEnabled: true,
          totpVerifiedAt: now,
        },
      });
    });

    this.logger.log(`MFA enrolled for owner user=${userId}`);
    return { recoveryCodes };
  }

  async disableMfaTotp(userId: string, dto: MfaTotpDisableDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountType: true,
        totpEnabled: true,
        totpSecretEnc: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    this.assertVenueOwner(user.accountType);
    if (!user.totpEnabled) {
      throw new BadRequestException('MFA is not enabled.');
    }
    await assertUserPassword(this.prisma, userId, dto.password);
    await this.assertTotpOrRecovery(userId, user.totpSecretEnc, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          totpEnabled: false,
          totpSecretEnc: null,
          totpVerifiedAt: null,
        },
      });
    });

    this.logger.log(`MFA disabled for owner user=${userId}`);
    return { ok: true as const };
  }

  async regenerateMfaRecoveryCodes(
    userId: string,
    dto: MfaRecoveryRegenerateDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountType: true,
        totpEnabled: true,
        totpSecretEnc: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    this.assertVenueOwner(user.accountType);
    if (!user.totpEnabled || !user.totpSecretEnc) {
      throw new BadRequestException('MFA is not enabled.');
    }
    await assertUserPassword(this.prisma, userId, dto.password);
    await this.assertTotpOrRecovery(userId, user.totpSecretEnc, dto);

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId,
          codeHash: hashRecoveryCode(code),
        })),
      });
    });

    this.logger.log(`MFA recovery codes regenerated for owner user=${userId}`);
    return { recoveryCodes };
  }

  async verifyMfaLogin(
    dto: MfaVerifyDto,
    ip?: string,
    ua?: string,
  ): Promise<AuthTokenBundle> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(dto.mfaToken, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge.');
    }
    if (!isMfaChallengePayload(payload)) {
      throw new UnauthorizedException('Invalid or expired MFA challenge.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        accountType: true,
        totpEnabled: true,
        totpSecretEnc: true,
        lockedUntil: true,
        failedLogins: true,
      },
    });
    if (
      !user ||
      user.accountType !== UserAccountType.VENUE_OWNER ||
      !user.totpEnabled ||
      !user.totpSecretEnc
    ) {
      throw new UnauthorizedException('Invalid or expired MFA challenge.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account locked. Try again later or reset your password.',
      );
    }

    const factorOk = await this.tryTotpOrRecovery(
      user.id,
      user.totpSecretEnc,
      dto,
    );
    if (!factorOk) {
      await this.bumpFailedLogins(user.id, user.failedLogins);
      throw new UnauthorizedException('Invalid MFA code.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    return this.completeLoginAfterPassword(user.id, ip, ua);
  }

  private async assertTotpOrRecovery(
    userId: string,
    totpSecretEnc: string | null,
    dto: { code?: string; recoveryCode?: string },
  ) {
    const ok = await this.tryTotpOrRecovery(userId, totpSecretEnc, dto);
    if (!ok) {
      throw new UnauthorizedException('Invalid authenticator or recovery code.');
    }
  }

  /** Verify TOTP or consume one recovery code. Returns false if neither matches. */
  private async tryTotpOrRecovery(
    userId: string,
    totpSecretEnc: string | null,
    dto: { code?: string; recoveryCode?: string },
  ): Promise<boolean> {
    const hasCode = Boolean(dto.code?.trim());
    const hasRecovery = Boolean(dto.recoveryCode?.trim());
    if (!hasCode && !hasRecovery) {
      throw new BadRequestException(
        'Provide an authenticator code or a recovery code.',
      );
    }

    if (hasCode && totpSecretEnc) {
      try {
        const secret = decryptTotpSecret(totpSecretEnc, this.mfaKeySource());
        if (verifyTotpCode(secret, dto.code!)) {
          return true;
        }
      } catch {
        /* fall through */
      }
    }

    if (hasRecovery) {
      const rows = await this.prisma.mfaRecoveryCode.findMany({
        where: { userId },
        select: { id: true, codeHash: true, usedAt: true },
      });
      const matchId = matchRecoveryCodeHash(dto.recoveryCode!, rows);
      if (matchId) {
        const marked = await this.prisma.mfaRecoveryCode.updateMany({
          where: { id: matchId, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (marked.count === 1) {
          this.logger.log(
            `MFA recovery code used for owner user=${userId}`,
          );
          return true;
        }
      }
    }

    return false;
  }

  private async bumpFailedLogins(userId: string, current: number) {
    const failed = current + 1;
    const lock =
      failed >= MAX_FAILED
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
        : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLogins: failed, lockedUntil: lock },
    });
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
      subject: 'Reset your Locora owner password',
      text: `Reset your password (valid ~1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Reset your Locora owner password (link valid about 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
      required: true,
    });

    return generic;
  }

  async resetOwnerPassword(dto: ResetPasswordDto) {
    const pwError = validatePasswordStrength(dto.password);
    if (pwError) throw new BadRequestException(pwError);

    const tokenHash = hashToken(dto.token.trim());
    const invalidMsg =
      'This reset link is invalid or expired. Request a new one from the owner sign-in panel.';
    const passwordHash = await hashPassword(dto.password);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: { gt: new Date() },
          accountType: 'VENUE_OWNER',
        },
      });
      if (!user) {
        throw new BadRequestException(invalidMsg);
      }

      // Atomic consume: concurrent reuse loses the race (count !== 1).
      const consumed = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: { gt: new Date() },
        },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(invalidMsg);
      }

      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
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

  // ─── Refresh token rotation ─────────────────────────────────────
  async refresh(refreshToken: string, ip?: string, ua?: string) {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: tokenHash },
    });
    if (!session) {
      throw new UnauthorizedException('Refresh token invalid.');
    }

    // Reuse of a rotated token → steal signal: revoke the whole family.
    if (session.revokedAt) {
      await this.revokeSessionFamily(session.familyId);
      throw new UnauthorizedException('Refresh token invalid.');
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token invalid.');
    }

    // Rotate: claim-revoke current (lost race = treat as reuse), then issue same family.
    const claimed = await this.prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeSessionFamily(session.familyId);
      throw new UnauthorizedException('Refresh token invalid.');
    }

    return this.issueTokens(session.userId, ip, ua, session.familyId);
  }

  /** Revoke every active session in a refresh-token family (reuse / theft response). */
  private async revokeSessionFamily(familyId: string) {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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

  /**
   * Active refresh sessions for the signed-in user (no raw tokens / hashes).
   * AuthSession has no updatedAt — createdAt is issue/rotate time for the row.
   */
  async listAuthSessions(userId: string) {
    const now = new Date();
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        createdAt: true,
        userAgent: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { sessions };
  }

  /** Revoke one session (and its refresh family). Must belong to userId. */
  async revokeAuthSession(userId: string, sessionId: string) {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, familyId: true, revokedAt: true },
    });
    if (!session) {
      throw new NotFoundException('Session not found.');
    }
    await this.revokeSessionFamily(session.familyId);
    return { revoked: true as const };
  }

  /**
   * Revoke every active session except the caller's current family.
   * Current family is resolved from refresh cookie, else JWT `sid` (staff).
   */
  async revokeOtherAuthSessions(
    userId: string,
    opts: { refreshToken?: string; sessionId?: string } = {},
  ) {
    const keepFamilyId = await this.resolveCurrentSessionFamilyId(userId, opts);
    if (!keepFamilyId) {
      throw new BadRequestException(
        'Current session required to revoke others.',
      );
    }

    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        familyId: { not: keepFamilyId },
      },
      data: { revokedAt: new Date() },
    });

    return { revokedCount: result.count };
  }

  private async resolveCurrentSessionFamilyId(
    userId: string,
    opts: { refreshToken?: string; sessionId?: string },
  ): Promise<string | null> {
    if (opts.refreshToken) {
      const tokenHash = hashToken(opts.refreshToken);
      const byRefresh = await this.prisma.authSession.findUnique({
        where: { refreshTokenHash: tokenHash },
        select: { userId: true, familyId: true, revokedAt: true },
      });
      if (
        byRefresh &&
        byRefresh.userId === userId &&
        byRefresh.revokedAt === null
      ) {
        return byRefresh.familyId;
      }
    }

    if (opts.sessionId) {
      const byId = await this.prisma.authSession.findFirst({
        where: {
          id: opts.sessionId,
          userId,
          revokedAt: null,
        },
        select: { familyId: true },
      });
      if (byId) return byId.familyId;
    }

    return null;
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

  /** Ensures the signed-in user may access this private dashboard URL. */
  async verifyVenueDashboard(
    userId: string,
    sysRole: string,
    venuePath: string,
  ) {
    const ref = classifyVenuePath(venuePath);
    if (!ref) {
      throw new BadRequestException('Invalid venue dashboard path.');
    }

    // Phase 3: always slug-only (legacy slug--key strips to slug; key not verified).
    const shop = await this.prisma.shop.findFirst({
      where: { slug: ref.slug },
      select: {
        id: true,
        slug: true,
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
      include: { permissionRows: { select: { permission: true } } },
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
    const effectivePerms = membership
      ? permissionsToEffectiveCsv({
          permissionRows: membership.permissionRows,
        })
      : '*';
    const payload: JwtAccessPayload = {
      sub: actor.sub,
      sysRole: actor.sysRole,
      email: actor.email,
      acct: actor.acct,
      sid: actor.sid,
      shopId: shop.id,
      shopRole: membership?.role ?? 'OWNER',
      perms: effectivePerms,
      tier: shopFull?.subscription?.tier,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    return { shop: shopProfile, accessToken, accessExpiresIn: accessTtl };
  }

  /** Primary venue slug for redirects (never the secret `slug--key`). */
  resolveVenuePathForUser(user: {
    memberships: {
      isActive: boolean;
      role: string;
      shop: { slug: string };
    }[];
  }): string | null {
    const active = user.memberships.filter((m) => m.isActive);
    const primary = active.find((m) => m.role === 'OWNER') ?? active[0];
    if (!primary) return null;
    return primary.shop.slug;
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

    const venuePath = this.resolveVenuePathForUser({
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
