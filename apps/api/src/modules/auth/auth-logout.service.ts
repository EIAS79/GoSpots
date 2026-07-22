import { Injectable } from '@nestjs/common';
import { hashToken } from '../../common/security/token';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Logout API surface — revoke the current refresh session.
 *
 * Extracted from `AuthService` as part of Bible #14 (auth capability split).
 * `AuthService` still facade-delegates `logout()` so controllers and existing
 * callers are unaffected.
 */
@Injectable()
export class AuthLogoutService {
  constructor(private readonly prisma: PrismaService) {}

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const tokenHash = hashToken(refreshToken);
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
