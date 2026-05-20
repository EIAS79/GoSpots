import argon2 from "argon2";

// argon2id with high memory cost — current OWASP recommendation (2024).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Strong password rules — enforced server-side regardless of client validation.
export function validatePasswordStrength(p: string): string | null {
  if (p.length < 10) return "Password must be at least 10 characters.";
  if (p.length > 128) return "Password too long.";
  if (!/[a-z]/.test(p)) return "Password must contain a lowercase letter.";
  if (!/[A-Z]/.test(p)) return "Password must contain an uppercase letter.";
  if (!/\d/.test(p)) return "Password must contain a number.";
  return null;
}
