import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ApiDomainErrorCode } from '../../../common/api-error.codes';
import { apiUnauthorizedException } from '../../../common/api-error.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAccessPayload } from '../auth.service';

const cookieExtractor = (req: Request): string | null => {
  if (req?.cookies?.access_token) return req.cookies.access_token;
  return null;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtAccessPayload) {
    if (!payload.sid) {
      throw apiUnauthorizedException(
        ApiDomainErrorCode.SESSION_REVOKED,
        'Session expired. Sign in again.',
      );
    }
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session) {
      throw apiUnauthorizedException(
        ApiDomainErrorCode.SESSION_REVOKED,
        'Session expired. Sign in again.',
      );
    }
    return payload;
  }
}
