import {
  HIGH_RISK_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSION_TEMPLATES,
  assertKnownPermissions,
  resolveRoleDefaultPermissions,
  resolveManagerPermissions,
} from './permissions';

describe('machine-readable Phase 1 permission catalog', () => {
  it('contains every required domain family', () => {
    const prefixes = new Set(Object.values(PERMISSIONS).map((permission) => permission.split('.')[0]));
    for (const family of [
      'venue', 'resource', 'session', 'order', 'checkout', 'payment', 'refund',
      'cash', 'invoice', 'fiscal', 'reservation', 'inventory', 'customer',
      'membership', 'staff', 'ticket', 'report', 'integration', 'settings', 'admin',
    ]) {
      expect(prefixes.has(family)).toBe(true);
    }
  });

  it('keeps high-risk actions as distinct permission keys', () => {
    expect(new Set(HIGH_RISK_PERMISSIONS).size).toBe(HIGH_RISK_PERMISSIONS.length);
    expect(HIGH_RISK_PERMISSIONS).toEqual(
      expect.arrayContaining([
        PERMISSIONS.PRICE_OVERRIDE,
        PERMISSIONS.DISCOUNT_MANUAL,
        PERMISSIONS.REFUND_EXECUTE,
        PERMISSIONS.CASH_PAID_OUT,
        PERMISSIONS.FISCAL_OVERRIDE,
      ]),
    );
  });

  it('does not automatically grant new sensitive incident privileges to managers or supervisors', () => {
    for (const permission of [
      PERMISSIONS.PRINT_INCIDENT_READ,
      PERMISSIONS.PRINT_INCIDENT_INVESTIGATE,
      PERMISSIONS.PRINT_INCIDENT_RESOLVE,
    ]) {
      expect(resolveRoleDefaultPermissions('MANAGER')).not.toContain(permission);
      expect(resolveRoleDefaultPermissions('SUPERVISOR')).not.toContain(permission);
      expect(resolveManagerPermissions().split(',')).not.toContain(permission);
    }
    const ownerGranted = resolveManagerPermissions([
      PERMISSIONS.PRINT_INCIDENT_READ,
      PERMISSIONS.PRINT_INCIDENT_INVESTIGATE,
      PERMISSIONS.PRINT_INCIDENT_RESOLVE,
    ]);
    expect(ownerGranted).toContain(PERMISSIONS.PRINT_INCIDENT_RESOLVE);
    expect(HIGH_RISK_PERMISSIONS).toContain(PERMISSIONS.PRINT_INCIDENT_RESOLVE);
  });

  it('defines safe templates for every venue staff role', () => {
    expect(Object.keys(ROLE_PERMISSION_TEMPLATES).sort()).toEqual(
      ['CASHIER', 'INVENTORY', 'KITCHEN', 'MANAGER', 'SERVER', 'STAFF', 'SUPERVISOR', 'VIEWER'].sort(),
    );
    expect(resolveRoleDefaultPermissions('CASHIER')).toContain(PERMISSIONS.CHECKOUT_WRITE);
    expect(resolveRoleDefaultPermissions('CASHIER')).not.toContain(PERMISSIONS.REFUND_EXECUTE);
    expect(resolveRoleDefaultPermissions('KITCHEN')).toEqual(
      expect.arrayContaining([PERMISSIONS.ORDER_READ, PERMISSIONS.ORDER_WRITE]),
    );
    expect(() => assertKnownPermissions(Object.values(PERMISSIONS))).not.toThrow();
  });
});
