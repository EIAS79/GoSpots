import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopRole, UserAccountType } from '@prisma/client';
import {
  hashPassword,
  validatePasswordStrength,
} from '../../common/security/password';
import {
  generatePasswordResetToken,
  hashToken,
  PASSWORD_RESET_TTL_MS,
} from '../../common/security/token';
import {
  isValidOwnerEmail,
  isVenueStaffLoginEmail,
  normalizeLoginIdentifier,
} from '../../common/venue-account';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  StaffForgotPasswordDto,
} from './dto/auth.dto';

/**
 * Password-reset API surface (owner + staff forgot-password).
 *
 * Extracted from `AuthService` as part of Bible #14 (auth capability split).
 * `AuthService` still facade-delegates so controllers and existing callers
 * are unaffected.
 */
@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

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
}
