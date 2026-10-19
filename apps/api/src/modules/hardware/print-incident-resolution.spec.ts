import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS, resolveManagerPermissions, resolveRoleDefaultPermissions } from '../../common/permissions';
import { PrintIncidentResolutionService } from './print-incident-resolution.service';

describe('T-009 Change A privileged incident authorization', () => {
  const service = new PrintIncidentResolutionService({} as never);
  const identity = (role: string, perms: string) => ({
    shopId: 'venue-a', shopRole: role, perms, sub: 'user-a',
  }) as never;

  it('keeps all newly registered incident permissions out of manager and supervisor defaults', () => {
    for (const permission of [
      PERMISSIONS.PRINT_INCIDENT_READ,
      PERMISSIONS.PRINT_INCIDENT_INVESTIGATE,
      PERMISSIONS.PRINT_INCIDENT_RESOLVE,
    ]) {
      expect(resolveRoleDefaultPermissions('MANAGER')).not.toContain(permission);
      expect(resolveRoleDefaultPermissions('SUPERVISOR')).not.toContain(permission);
    }
    expect(resolveManagerPermissions([PERMISSIONS.PRINT_INCIDENT_READ]))
      .toContain(PERMISSIONS.PRINT_INCIDENT_READ);
  });
  it('uses identical role/read policy for incident listing and case detail', () => {
    expect(() => service.assertRead(identity('STAFF', PERMISSIONS.SHOP_MANAGE))).toThrow(ForbiddenException);
    expect(() => service.assertRead(identity('MANAGER', PERMISSIONS.TRANSACTION_READ))).toThrow(ForbiddenException);
    expect(() => service.assertRead(identity('MANAGER', PERMISSIONS.SHOP_MANAGE))).not.toThrow();
    expect(() => service.assertRead(identity('SUPERVISOR', PERMISSIONS.PRINT_INCIDENT_READ))).not.toThrow();
  });
  it('requires read AND investigation grants, not any-of decorator semantics', () => {
    expect(() => service.assertInvestigate(identity('MANAGER', PERMISSIONS.PRINT_INCIDENT_INVESTIGATE)))
      .toThrow(ForbiddenException);
    expect(() => service.assertInvestigate(identity('SUPERVISOR', PERMISSIONS.PRINT_INCIDENT_READ)))
      .toThrow(ForbiddenException);
    expect(() => service.assertInvestigate(identity('MANAGER',
      [PERMISSIONS.PRINT_INCIDENT_READ, PERMISSIONS.PRINT_INCIDENT_INVESTIGATE].join(',')))).not.toThrow();
  });
  it('requires read AND resolve grants, separately from investigation', () => {
    expect(() => service.assertResolve(identity('MANAGER', PERMISSIONS.PRINT_INCIDENT_RESOLVE)))
      .toThrow(ForbiddenException);
    expect(() => service.assertResolve(identity('SUPERVISOR', PERMISSIONS.PRINT_INCIDENT_READ)))
      .toThrow(ForbiddenException);
    expect(() => service.assertResolve(identity('MANAGER',
      [PERMISSIONS.PRINT_INCIDENT_READ, PERMISSIONS.PRINT_INCIDENT_RESOLVE].join(',')))).not.toThrow();
  });
  it('rejects cashier and other unapproved roles even if raw permission is present', () => {
    expect(() => service.assertResolve(identity('CASHIER', '*'))).toThrow(ForbiddenException);
    expect(() => service.assertInvestigate(identity('STAFF', '*'))).toThrow(ForbiddenException);
  });
  it('does not issue any print, retry or status mutation from authorization checks', () => {
    service.assertRead(identity('OWNER', '*'));
    service.assertInvestigate(identity('OWNER', '*'));
    service.assertResolve(identity('OWNER', '*'));
    expect(Object.keys(service).length).toBe(1); // only injected Prisma handle
  });
});
