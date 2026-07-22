import {

  BadRequestException,

  forwardRef,

  Inject,

  Injectable,

  Logger,

  UnauthorizedException,

  ForbiddenException,

} from '@nestjs/common';

import { ApiDomainErrorCode } from '../../common/api-error.codes';

import { apiUnauthorizedException } from '../../common/api-error.util';

import { ConfigService } from '@nestjs/config';

import { JwtService } from '@nestjs/jwt';

import { UserAccountType } from '@prisma/client';

import {

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

import {

  buildStaffMfaLockoutMail,

  isStaffMfaOptInEnabled,

  isUserMfaLoginEligible,

  resolveStaffMfaApiAccess,

  staffMfaForbiddenMessage,

} from '../../common/staff-mfa.util';

import { assertUserPassword } from '../../common/security/verify-password.util';

import { MailService } from '../mail/mail.service';

import { PrismaService } from '../../prisma/prisma.service';

import { AuthService, type AuthTokenBundle } from './auth.service';

import {

  MfaRecoveryRegenerateDto,

  MfaTotpBeginDto,

  MfaTotpConfirmDto,

  MfaTotpDisableDto,

  MfaVerifyDto,

} from './dto/auth.dto';



const MAX_FAILED = 5;

const LOCK_MINUTES = 15;



type MfaUserRow = {

  accountType: UserAccountType;

  email: string;

  name: string | null;

  staffHandle: string | null;

  memberships: { role: string; shopId: string }[];

};



/**

 * Owner + elevated staff TOTP MFA API surface (enroll, confirm, disable, recovery, login verify).

 *

 * Extracted from `AuthService` as part of Bible #14 (auth capability split).

 * `AuthService` still facade-delegates so controllers and existing callers

 * are unaffected. Login MFA challenge JWT issuance stays on `AuthService.login`

 * because it shares the password-login path; post-MFA session completion uses

 * the `mfaCompleteLogin` wire hook on `AuthService`.

 */

@Injectable()

export class AuthMfaService {

  private readonly logger = new Logger(AuthMfaService.name);



  constructor(

    private readonly prisma: PrismaService,

    private readonly jwt: JwtService,

    private readonly config: ConfigService,

    private readonly mail: MailService,

    @Inject(forwardRef(() => AuthService))

    private readonly auth: Pick<AuthService, 'mfaCompleteLogin'>,

  ) {}



  private mfaKeySource(): MfaEncryptionKeySource {

    return {

      mfaTotpEncryptionKey: this.config.get<string>('MFA_TOTP_ENCRYPTION_KEY'),

      jwtAccessSecret: this.config.get<string>('JWT_ACCESS_SECRET'),

    };

  }



  private staffMfaOptIn(): boolean {

    return isStaffMfaOptInEnabled({

      STAFF_MFA_OPT_IN: this.config.get<string>('STAFF_MFA_OPT_IN'),

    });

  }



  private async loadMfaUser(userId: string): Promise<MfaUserRow> {

    const user = await this.prisma.user.findUnique({

      where: { id: userId },

      select: {

        accountType: true,

        email: true,

        name: true,

        staffHandle: true,

        memberships: {

          where: { isActive: true },

          select: { role: true, shopId: true },

        },

      },

    });

    if (!user) throw new UnauthorizedException();

    return user;

  }



  private assertMfaEligible(user: MfaUserRow) {

    if (user.accountType === UserAccountType.VENUE_OWNER) {

      return;

    }

    const access = resolveStaffMfaApiAccess({

      accountType: user.accountType,

      membershipRoles: (user.memberships ?? []).map((m) => m.role as never),

      staffMfaOptIn: this.staffMfaOptIn(),

    });

    if (!access.allowed) {

      throw new ForbiddenException(staffMfaForbiddenMessage(access.reason));

    }

  }



  async getMfaStatus(userId: string) {

    const user = await this.prisma.user.findUnique({

      where: { id: userId },

      select: { accountType: true, totpEnabled: true },

    });

    if (!user) throw new UnauthorizedException();

    const full = await this.loadMfaUser(userId);

    this.assertMfaEligible(full);

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

        name: true,

        staffHandle: true,

        memberships: {

          where: { isActive: true },

          select: { role: true, shopId: true },

        },

      },

    });

    if (!user) throw new UnauthorizedException();

    this.assertMfaEligible(user);

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

        issuer: 'GoSpots',

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

        email: true,

        name: true,

        staffHandle: true,

        memberships: {

          where: { isActive: true },

          select: { role: true, shopId: true },

        },

      },

    });

    if (!user) throw new UnauthorizedException();

    this.assertMfaEligible(user);

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

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_INVALID,
        'Invalid authenticator code.',
      );

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



    this.logger.log(`MFA enrolled for user=${userId} acct=${user.accountType}`);

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

        email: true,

        name: true,

        staffHandle: true,

        memberships: {

          where: { isActive: true },

          select: { role: true, shopId: true },

        },

      },

    });

    if (!user) throw new UnauthorizedException();

    this.assertMfaEligible(user);

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



    this.logger.log(`MFA disabled for user=${userId} acct=${user.accountType}`);

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

        email: true,

        name: true,

        staffHandle: true,

        memberships: {

          where: { isActive: true },

          select: { role: true, shopId: true },

        },

      },

    });

    if (!user) throw new UnauthorizedException();

    this.assertMfaEligible(user);

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



    this.logger.log(

      `MFA recovery codes regenerated for user=${userId} acct=${user.accountType}`,

    );

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

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_REQUIRED,
        'Invalid or expired MFA challenge.',
      );

    }

    if (!isMfaChallengePayload(payload)) {

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_REQUIRED,
        'Invalid or expired MFA challenge.',
      );

    }



    const user = await this.prisma.user.findUnique({

      where: { id: payload.sub },

      select: {

        id: true,

        accountType: true,

        email: true,

        name: true,

        staffHandle: true,

        totpEnabled: true,

        totpSecretEnc: true,

        lockedUntil: true,

        failedLogins: true,

        memberships: {

          where: { isActive: true },

          select: { role: true, shopId: true },

        },

      },

    });

    if (!user || !user.totpEnabled || !user.totpSecretEnc) {

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_REQUIRED,
        'Invalid or expired MFA challenge.',
      );

    }



    const loginEligible = isUserMfaLoginEligible({

      accountType: user.accountType,

      totpEnabled: user.totpEnabled,

      staffMembershipRoles: (user.memberships ?? []).map((m) => m.role as never),

      staffMfaOptIn: this.staffMfaOptIn(),

    });

    if (!loginEligible) {

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_REQUIRED,
        'Invalid or expired MFA challenge.',
      );

    }



    if (user.lockedUntil && user.lockedUntil > new Date()) {

      throw new UnauthorizedException(

        user.accountType === UserAccountType.VENUE_OWNER

          ? 'Account locked. Try again later or reset your password.'

          : 'Account locked. Ask your venue owner to help unlock it.',

      );

    }



    const factorOk = await this.tryTotpOrRecovery(

      user.id,

      user.totpSecretEnc,

      dto,

    );

    if (!factorOk) {

      const remainingCodes = await this.prisma.mfaRecoveryCode.count({

        where: { userId: user.id, usedAt: null },

      });

      const lockedUntil = await this.bumpFailedLogins(user.id, user.failedLogins);

      if (user.accountType === UserAccountType.VENUE_STAFF) {

        if (remainingCodes === 0) {

          await this.maybeNotifyStaffMfaLockout({

            user,

            reason: 'no_recovery_codes',

            lockedUntil: null,

          });

        } else if (lockedUntil) {

          await this.maybeNotifyStaffMfaLockout({

            user,

            reason: 'locked',

            lockedUntil,

          });

        }

      }

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_INVALID,
        'Invalid MFA code.',
      );

    }



    await this.prisma.user.update({

      where: { id: user.id },

      data: { failedLogins: 0, lockedUntil: null },

    });



    return this.auth.mfaCompleteLogin(user.id, ip, ua);

  }



  private async assertTotpOrRecovery(

    userId: string,

    totpSecretEnc: string | null,

    dto: { code?: string; recoveryCode?: string },

  ) {

    const ok = await this.tryTotpOrRecovery(userId, totpSecretEnc, dto);

    if (!ok) {

      throw apiUnauthorizedException(
        ApiDomainErrorCode.MFA_INVALID,
        'Invalid authenticator or recovery code.',
      );

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

          this.logger.log(`MFA recovery code used for user=${userId}`);

          return true;

        }

      }

    }



    return false;

  }



  private async bumpFailedLogins(

    userId: string,

    current: number,

  ): Promise<Date | null> {

    const failed = current + 1;

    const lock =

      failed >= MAX_FAILED

        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)

        : null;

    await this.prisma.user.update({

      where: { id: userId },

      data: { failedLogins: failed, lockedUntil: lock },

    });

    return lock;

  }



  /** Fail-open email to venue platform owner(s) when elevated staff MFA lockout. */

  private async maybeNotifyStaffMfaLockout(input: {

    user: {

      id: string;

      email: string;

      name: string | null;

      staffHandle: string | null;

      memberships: { role: string; shopId: string }[];

    };

    reason: 'locked' | 'no_recovery_codes';

    lockedUntil: Date | null;

  }) {

    if (input.reason === 'locked' && !input.lockedUntil) {

      return;

    }



    const staffLabel =

      input.user.name?.trim() ||

      input.user.staffHandle ||

      input.user.email.split('@')[0];



    const shopIds = [

      ...new Set((input.user.memberships ?? []).map((m) => m.shopId)),

    ];

    if (shopIds.length === 0) return;



    const shops = await this.prisma.shop.findMany({

      where: { id: { in: shopIds } },

      select: {

        id: true,

        name: true,

        owner: { select: { email: true } },

      },

    });



    for (const shop of shops) {

      if (!shop.owner.email) continue;

      const body = buildStaffMfaLockoutMail({

        staffLabel,

        staffEmail: input.user.email,

        shopName: shop.name,

        reason: input.reason,

        lockedUntil: input.lockedUntil,

      });

      try {

        await this.mail.send({

          to: shop.owner.email,

          subject: body.subject,

          text: body.text,

          html: body.html,

          shopId: shop.id,

          required: false,

        });

      } catch (err) {

        this.logger.warn(

          `Staff MFA lockout email failed shop=${shop.id} user=${input.user.id}: ${

            err instanceof Error ? err.message : String(err)

          }`,

        );

      }

    }

  }

}


