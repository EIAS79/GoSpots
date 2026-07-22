import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyPassword } from './password';

/**
 * Dummy argon2id hash for constant-time verification when the user row is
 * missing. Matches the pattern used in auth login (do not rewrite auth.service).
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$invalidsalt$invalid';

/** Header alternate for body `password` on sensitive mutations. */
export const CONFIRM_PASSWORD_HEADER = 'x-confirm-password';

type UserPasswordLookup = {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { passwordHash: true };
    }) => Promise<{ passwordHash: string } | null>;
  };
};

/**
 * Resolve confirm password from JSON body and/or `X-Confirm-Password` header.
 * Body wins when both are present.
 */
export function resolveConfirmPassword(
  bodyPassword?: string | null,
  headerPassword?: string | null,
): string | undefined {
  const fromBody =
    typeof bodyPassword === 'string' ? bodyPassword.trim() : '';
  if (fromBody) return fromBody;
  const fromHeader =
    typeof headerPassword === 'string' ? headerPassword.trim() : '';
  if (fromHeader) return fromHeader;
  return undefined;
}

/**
 * Require a non-empty confirm password (body or header).
 */
export function requireConfirmPassword(
  bodyPassword?: string | null,
  headerPassword?: string | null,
): string {
  const password = resolveConfirmPassword(bodyPassword, headerPassword);
  if (!password) {
    throw new BadRequestException(
      'Password confirmation is required for this action.',
    );
  }
  return password;
}

/**
 * Verify plain password against the user's stored hash (forced reauth).
 * Does not touch login lock counters or auth.service.
 */
export async function assertUserPassword(
  prisma: UserPasswordLookup,
  userId: string,
  plainPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) {
    await verifyPassword(DUMMY_PASSWORD_HASH, plainPassword);
    throw new UnauthorizedException('Password confirmation failed.');
  }
  const ok = await verifyPassword(user.passwordHash, plainPassword);
  if (!ok) {
    throw new UnauthorizedException('Password confirmation failed.');
  }
}
