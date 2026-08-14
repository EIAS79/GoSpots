import { ShopRole, UserAccountType } from '@prisma/client';

/**
 * Membership roles that may opt into TOTP in Bible §12 Phase 1 (elevated staff).
 * Plain `STAFF` remains blocked until Phase 2.
 */
export const STAFF_MFA_PHASE1_ELIGIBLE_ROLES: readonly ShopRole[] = [
  ShopRole.OWNER,
  ShopRole.MANAGER,
  ShopRole.SUPERVISOR,
] as const;

/** Env gate for staff MFA rollout (default off until Phase 1 lane ships). */
export function isStaffMfaOptInEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.STAFF_MFA_OPT_IN?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function isStaffMfaEligibleMembershipRole(role: ShopRole): boolean {
  return (STAFF_MFA_PHASE1_ELIGIBLE_ROLES as readonly ShopRole[]).includes(role);
}

export function hasStaffMfaEligibleMembership(
  roles: readonly ShopRole[],
): boolean {
  return roles.some(isStaffMfaEligibleMembershipRole);
}

/** True when password login should return `{ mfaRequired, mfaToken }`. */
export function isUserMfaLoginEligible(input: {
  accountType: UserAccountType;
  totpEnabled: boolean;
  staffMembershipRoles?: readonly ShopRole[];
  staffMfaOptIn?: boolean;
}): boolean {
  if (!input.totpEnabled) return false;
  if (input.accountType === UserAccountType.VENUE_OWNER) return true;
  if (input.accountType !== UserAccountType.VENUE_STAFF) return false;
  if (!input.staffMfaOptIn) return false;
  return hasStaffMfaEligibleMembership(input.staffMembershipRoles ?? []);
}

export type StaffMfaForbiddenReason = 'owner_only' | 'role_ineligible';

/** Resolve Phase 1 MFA API eligibility or the 403 reason for staff. */
export function resolveStaffMfaApiAccess(input: {
  accountType: UserAccountType;
  membershipRoles: readonly ShopRole[];
  staffMfaOptIn: boolean;
}): { allowed: true } | { allowed: false; reason: StaffMfaForbiddenReason } {
  if (input.accountType === UserAccountType.VENUE_OWNER) {
    return { allowed: true };
  }
  if (input.accountType !== UserAccountType.VENUE_STAFF) {
    return { allowed: false, reason: 'owner_only' };
  }
  if (!input.staffMfaOptIn) {
    return { allowed: false, reason: 'owner_only' };
  }
  if (!hasStaffMfaEligibleMembership(input.membershipRoles)) {
    return { allowed: false, reason: 'role_ineligible' };
  }
  return { allowed: true };
}

export function staffMfaForbiddenMessage(reason: StaffMfaForbiddenReason): string {
  if (reason === 'role_ineligible') {
    return 'Two-factor authentication is not available for your role.';
  }
  return 'Two-factor authentication is owner-only.';
}

export function buildStaffMfaLockoutMail(input: {
  staffLabel: string;
  staffEmail: string;
  shopName: string;
  reason: 'locked' | 'no_recovery_codes';
  lockedUntil?: Date | null;
}): { subject: string; text: string; html: string } {
  const subject = 'Staff MFA lockout — action may be needed';
  const detail =
    input.reason === 'locked'
      ? input.lockedUntil
        ? `Their account is locked until ${input.lockedUntil.toISOString()} (UTC) after repeated failed MFA attempts.`
        : 'Their account was locked after repeated failed MFA attempts.'
      : 'They have no recovery codes left and could not complete MFA at sign-in.';
  const text = [
    `A manager-level staff member may be locked out of MFA for ${input.shopName}.`,
    '',
    `Staff: ${input.staffLabel} (${input.staffEmail})`,
    detail,
    '',
    'You can help by opening Employee accounts to issue a password reset link.',
    'Staff must use their own credentials to disable MFA if enrolled.',
  ].join('\n');
  const html = [
    `<p>A manager-level staff member may be <strong>locked out of MFA</strong> for ${escapeHtml(input.shopName)}.</p>`,
    `<p><strong>Staff:</strong> ${escapeHtml(input.staffLabel)} (${escapeHtml(input.staffEmail)})<br/>`,
    `${escapeHtml(detail)}</p>`,
    '<p>You can help by opening <strong>Employee accounts</strong> to issue a password reset link.</p>',
    '<p>Staff must use their own credentials to disable MFA if enrolled.</p>',
  ].join('');
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
