import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/** RFC 4648 base32 alphabet (no padding). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const MFA_TOTP_DIGITS = 6;
export const MFA_TOTP_PERIOD_SEC = 30;
export const MFA_TOTP_WINDOW = 1;
export const MFA_TOTP_SECRET_BYTES = 20;

/** AES-256-GCM payload: v1:<iv_b64url>:<tag_b64url>:<ct_b64url> */
const ENC_PREFIX = 'v1:';

export type MfaEncryptionKeySource = {
  /** Preferred: 32-byte key as 64 hex chars (or any string → SHA-256). */
  mfaTotpEncryptionKey?: string | null;
  /** Fallback when MFA key unset (dev / single-secret deploys). */
  jwtAccessSecret?: string | null;
};

export function generateTotpSecret(bytes = MFA_TOTP_SECRET_BYTES): string {
  return base32Encode(randomBytes(bytes));
}

export function buildOtpAuthUri(input: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = (input.issuer ?? 'Locora').trim() || 'Locora';
  const account = input.accountName.trim() || 'owner';
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: input.secret.replace(/=+$/g, '').toUpperCase(),
    issuer,
    algorithm: 'SHA1',
    digits: String(MFA_TOTP_DIGITS),
    period: String(MFA_TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateTotpCode(
  secretBase32: string,
  counter: number = Math.floor(Date.now() / 1000 / MFA_TOTP_PERIOD_SEC),
): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const code = bin % 10 ** MFA_TOTP_DIGITS;
  return String(code).padStart(MFA_TOTP_DIGITS, '0');
}

/** Constant-time verify across ±window steps. */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  opts?: { nowMs?: number; window?: number },
): boolean {
  const cleaned = normalizeTotpCode(code);
  if (!cleaned) return false;
  const window = opts?.window ?? MFA_TOTP_WINDOW;
  const nowMs = opts?.nowMs ?? Date.now();
  const counter = Math.floor(nowMs / 1000 / MFA_TOTP_PERIOD_SEC);
  const expected = Buffer.from(cleaned, 'utf8');
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(
      generateTotpCode(secretBase32, counter + i),
      'utf8',
    );
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeTotpCode(code: string): string | null {
  const digits = String(code ?? '')
    .replace(/\s+/g, '')
    .trim();
  if (!/^\d{6}$/.test(digits)) return null;
  return digits;
}

export function resolveMfaEncryptionKey(source: MfaEncryptionKeySource): Buffer {
  const preferred = source.mfaTotpEncryptionKey?.trim();
  if (preferred) {
    if (/^[0-9a-fA-F]{64}$/.test(preferred)) {
      return Buffer.from(preferred, 'hex');
    }
    return createHash('sha256').update(preferred, 'utf8').digest();
  }
  const jwt = source.jwtAccessSecret?.trim();
  if (!jwt) {
    throw new Error(
      'MFA TOTP encryption requires MFA_TOTP_ENCRYPTION_KEY or JWT_ACCESS_SECRET.',
    );
  }
  return createHash('sha256')
    .update(`locora-mfa-totp-v1:${jwt}`, 'utf8')
    .digest();
}

export function encryptTotpSecret(
  plaintextSecret: string,
  keySource: MfaEncryptionKeySource,
): string {
  const key = resolveMfaEncryptionKey(keySource);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintextSecret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    ENC_PREFIX +
    [iv, tag, ct].map((b) => b.toString('base64url')).join(':')
  );
}

export function decryptTotpSecret(
  payload: string,
  keySource: MfaEncryptionKeySource,
): string {
  if (!payload.startsWith(ENC_PREFIX)) {
    throw new Error('Unsupported TOTP secret ciphertext version.');
  }
  const parts = payload.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed TOTP secret ciphertext.');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const key = resolveMfaEncryptionKey(keySource);
  const iv = Buffer.from(ivB64!, 'base64url');
  const tag = Buffer.from(tagB64!, 'base64url');
  const ct = Buffer.from(ctB64!, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    'utf8',
  );
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) {
      throw new Error('Invalid base32 TOTP secret.');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
