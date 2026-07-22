import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiUnauthorizedException } from '../../common/api-error.util';
import { hashToken } from '../../common/security/token';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

const REFRESH_INVALID_MESSAGE = 'Refresh token invalid.';

/**
 * Refresh-token rotation API surface.
 *
 * Extracted from `AuthService` as part of Bible #14 (auth capability split).
 * `AuthService` still facade-delegates `refresh()` so controllers and existing
 * callers are unaffected. Token issuance stays on `AuthService.issueTokens`
 * because login / activate / refresh share that path.
 */
@Injectable()
export class AuthRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private readonly auth: Pick<AuthService, 'refreshIssueTokens'>,
  ) {}

  async refresh(refreshToken: string, ip?: string, ua?: string) {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: tokenHash },
    });
    if (!session) {
      throw new UnauthorizedException(REFRESH_INVALID_MESSAGE);
    }

    // Reuse of a rotated token → steal signal: revoke the whole family.
    if (session.revokedAt) {
      await this.revokeSessionFamily(session.familyId);
      throw apiUnauthorizedException(
        ApiDomainErrorCode.SESSION_REVOKED,
        REFRESH_INVALID_MESSAGE,
      );
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(REFRESH_INVALID_MESSAGE);
    }

    // Rotate: claim-revoke current (lost race = treat as reuse), then issue same family.
    const claimed = await this.prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeSessionFamily(session.familyId);
      throw apiUnauthorizedException(
        ApiDomainErrorCode.SESSION_REVOKED,
        REFRESH_INVALID_MESSAGE,
      );
    }

    return this.auth.refreshIssueTokens(
      session.userId,
      ip,
      ua,
      session.familyId,
    );
  }

  /** Revoke every active session in a refresh-token family (reuse / theft response). */
  private async revokeSessionFamily(familyId: string) {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
