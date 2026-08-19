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
import { AuditService } from '../audit/audit.service';

const INTEGRATION_SCOPES_KEY = 'gospots:integration-scopes';

export type IntegrationApiAuth = {
  credentialId: string;
  credentialName: string;
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
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      originalUrl?: string;
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
      credentialName: credential.name,
      shopId: credential.shopId,
      scopes,
    };
    await this.prisma.integrationCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });
    const correlation = req.headers['x-correlation-id'];
    const userAgent = req.headers['user-agent'];
    await this.audit.recordForShop(credential.shopId, {
      section: 'system',
      action: 'public_api.request',
      summary: `Public API ${String(req.method ?? 'REQUEST').toUpperCase()} request by ${credential.name}`,
      actorName: `Service account: ${credential.name}`,
      correlationId: Array.isArray(correlation) ? correlation[0] : correlation,
      sourceDevice: Array.isArray(userAgent) ? userAgent[0] : userAgent,
      meta: {
        credentialId: credential.id,
        method: String(req.method ?? '').toUpperCase(),
        path: String(req.originalUrl ?? req.url ?? '').split('?')[0],
        requiredScopes: required,
      },
    });
    return true;
  }
}
