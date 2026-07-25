import { hashToken } from '../../common/security/token';
import { AuthLogoutService } from './auth-logout.service';

describe('AuthLogoutService', () => {
  it('revokes the whole refresh family', async () => {
    const prisma = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({ familyId: 'fam-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const svc = new AuthLogoutService(prisma as never);
    await svc.logout('raw-refresh');
    expect(prisma.authSession.findUnique).toHaveBeenCalledWith({
      where: { refreshTokenHash: hashToken('raw-refresh') },
      select: { familyId: true },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('no-ops when refresh cookie missing or unknown', async () => {
    const prisma = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    const svc = new AuthLogoutService(prisma as never);
    await svc.logout(undefined);
    await svc.logout('missing');
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });
});
