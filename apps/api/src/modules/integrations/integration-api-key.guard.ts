import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const INTEGRATION_SCOPES_KEY = 'gospots:integration-scopes';

export type IntegrationApiAuth = {
  credentialId: string;
  shopId: string;
  scopes: string[];
};

export const RequireIntegrationScopes = (...scopes: string[]) =>
  SetMetadata(INTEGRATION_SCOPES_KEY, scopes);

export const CurrentIntegrationAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ integrationAuth?: IntegrationApiAuth }>()
      .integrationAuth,
);

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      integrationAuth?: IntegrationApiAuth;
    }>();
    const header = req.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const match = /^Bearer\s+(gsp_live_[A-Za-z0-9_-]+)$/.exec(value ?? '');
    if (!match) throw new UnauthorizedException('Integration API bearer token required');
    const tokenHash = createHash('sha256').update(match[1]).digest('hex');
    const credential = await this.prisma.integrationCredential.findUnique({
      where: { tokenHash },
    });
    if (
      !credential ||
      !credential.active ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= new Date())
    ) {
      throw new UnauthorizedException('Integration API credential is invalid or expired');
    }
    const scopes = Array.isArray(credential.scopes)
      ? credential.scopes.map(String)
      : [];
    const required = this.reflector.getAllAndOverride<string[]>(
      INTEGRATION_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [];
    if (required.some((scope) => !scopes.includes('*') && !scopes.includes(scope))) {
      throw new ForbiddenException('Integration API credential lacks required scope');
    }
    req.integrationAuth = {
      credentialId: credential.id,
      shopId: credential.shopId,
      scopes,
    };
    await this.prisma.integrationCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });
    return true;
  }
}
