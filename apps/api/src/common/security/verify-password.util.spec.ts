import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword } from './password';
import {
  assertUserPassword,
  requireConfirmPassword,
  resolveConfirmPassword,
} from './verify-password.util';

describe('verify-password.util', () => {
  describe('resolveConfirmPassword', () => {
    it('prefers body over header', () => {
      expect(resolveConfirmPassword(' from-body ', 'from-header')).toBe(
        'from-body',
      );
    });

    it('falls back to header when body empty', () => {
      expect(resolveConfirmPassword('  ', ' hdr ')).toBe('hdr');
      expect(resolveConfirmPassword(undefined, 'hdr')).toBe('hdr');
    });

    it('returns undefined when both missing', () => {
      expect(resolveConfirmPassword(undefined, undefined)).toBeUndefined();
      expect(resolveConfirmPassword('', '')).toBeUndefined();
    });
  });

  describe('requireConfirmPassword', () => {
    it('throws BadRequest when missing', () => {
      expect(() => requireConfirmPassword(undefined, undefined)).toThrow(
        BadRequestException,
      );
    });

    it('returns resolved password', () => {
      expect(requireConfirmPassword('secret', undefined)).toBe('secret');
    });
  });

  describe('assertUserPassword', () => {
    it('accepts matching password', async () => {
      const passwordHash = await hashPassword('CorrectHorse1');
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ passwordHash }),
        },
      };
      await expect(
        assertUserPassword(prisma, 'user_1', 'CorrectHorse1'),
      ).resolves.toBeUndefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        select: { passwordHash: true },
      });
    });

    it('rejects wrong password', async () => {
      const passwordHash = await hashPassword('CorrectHorse1');
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ passwordHash }),
        },
      };
      await expect(
        assertUserPassword(prisma, 'user_1', 'WrongPassword1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects missing user after dummy verify', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      await expect(
        assertUserPassword(prisma, 'missing', 'Anything123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
