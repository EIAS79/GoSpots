import { MethodNotAllowedException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService Phase 1 integrity', () => {
  const actor = {
    sub: 'user-1',
    shopId: 'shop-1',
    shopRole: 'OWNER',
    email: 'owner@example.test',
  } as never;

  it('persists correlation, device, reason and before/after context', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Owner', email: 'owner@example.test' }) },
      auditLog: { create },
    } as unknown as PrismaService;
    const service = new AuditService(prisma);

    await service.record(actor, {
      section: 'team',
      action: 'staff.permissions.change',
      summary: 'Changed permissions',
      correlationId: 'corr-1',
      sourceDevice: 'terminal-1',
      reason: 'Shift coverage',
      previousState: { permissions: ['order.read'] },
      newState: { permissions: ['order.read', 'order.write'] },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 'shop-1',
        correlationId: 'corr-1',
        sourceDevice: 'terminal-1',
        reason: 'Shift coverage',
        previousState: { permissions: ['order.read'] },
        newState: { permissions: ['order.read', 'order.write'] },
      }),
    });
  });

  it('rejects destructive audit deletion even for an owner', async () => {
    const service = new AuditService({} as PrismaService);
    await expect(service.remove(actor, 'audit-1')).rejects.toBeInstanceOf(
      MethodNotAllowedException,
    );
  });
});
