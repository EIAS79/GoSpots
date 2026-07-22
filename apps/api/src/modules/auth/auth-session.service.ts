import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashToken } from '../../common/security/token';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Session management API surface (list + revoke by id + revoke-others).
 *
 * Extracted from `AuthService` as part of Bible #11 (auth capability split).
 * `AuthService` still facade-delegates these methods so controllers and
 * existing callers are unaffected. This service intentionally does NOT own
 * refresh / logout / issueTokens — refresh rotation is on `AuthRefreshService`;
 * logout revoke is on `AuthLogoutService`; issueTokens stays on `AuthService`
 * because login / activate / refresh share that path.
 */
@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Revoke every active session in a refresh-token family (reuse / theft response).
   *
   * NOTE: an identical private helper lives on `AuthRefreshService` because
   * `refresh()` also needs it. This copy is intentional so the session API
   * surface is self-contained (move-only refactor — same behavior).
   */
  private async revokeSessionFamily(familyId: string) {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
}
