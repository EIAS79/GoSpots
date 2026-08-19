import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';

describe('IntegrationApiKeyGuard Phase 13 contract', () => {
  function setup(overrides: Record<string, unknown> = {}) {
    const prisma: any = {
      integrationCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cred-1',
          name: 'warehouse-service',
          shopId: 'shop-a',
          scopes: ['venue:read'],
          active: true,
          revokedAt: null,
          expiresAt: null,
          ...overrides,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const reflector: any = { getAllAndOverride: jest.fn().mockReturnValue(['venue:read']) };
    const audit: any = { recordForShop: jest.fn().mockResolvedValue({}) };
    const guard = new IntegrationApiKeyGuard(prisma, reflector, audit);
    const request: any = {
      method: 'GET',
      originalUrl: '/integrations/v1/venue?ignored=1',
      headers: {
        authorization: 'Bearer gsp_live_test-token_123456',
        'x-correlation-id': 'corr-1',
        'user-agent': 'phase13-test',
      },
    };
    const context: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return { guard, prisma, reflector, audit, request, context };
  }

  it('binds the service account to its tenant and emits a secret-free durable audit event', async () => {
    const { guard, prisma, audit, request, context } = setup();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.integrationAuth).toEqual({
      credentialId: 'cred-1',
      credentialName: 'warehouse-service',
      shopId: 'shop-a',
      scopes: ['venue:read'],
    });
    expect(prisma.integrationCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
    expect(audit.recordForShop).toHaveBeenCalledWith(
      'shop-a',
      expect.objectContaining({
        action: 'public_api.request',
        correlationId: 'corr-1',
        meta: expect.objectContaining({
          credentialId: 'cred-1',
          method: 'GET',
          path: '/integrations/v1/venue',
          requiredScopes: ['venue:read'],
        }),
      }),
    );
    expect(JSON.stringify(audit.recordForShop.mock.calls)).not.toContain('gsp_live_test-token_123456');
  });

  it('rejects a credential without the required scope before audit', async () => {
    const { guard, reflector, audit, context } = setup({ scopes: ['resources:read'] });
    reflector.getAllAndOverride.mockReturnValue(['venue:read']);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.recordForShop).not.toHaveBeenCalled();
  });

  it('rejects revoked credentials', async () => {
    const { guard, audit, context } = setup({ revokedAt: new Date() });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.recordForShop).not.toHaveBeenCalled();
  });
});
