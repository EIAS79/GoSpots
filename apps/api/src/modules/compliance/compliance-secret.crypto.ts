import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function decodeKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  try {
    const key = Buffer.from(value, 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ComplianceSecretCryptoService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const raw = this.config.get<string>('COMPLIANCE_CREDENTIALS_MASTER_KEY') ?? '';
    const key = decodeKey(raw);
    if (!key) {
      throw new ServiceUnavailableException(
        'COMPLIANCE_CREDENTIALS_MASTER_KEY must be a 32-byte base64 value or 64-character hex key.',
      );
    }
    return key;
  }

  encrypt(value: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
  }

  decrypt(value: string, aad: string): string {
    const [version, iv, tag, ciphertext] = value.split(':');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new ServiceUnavailableException('Stored compliance credential is invalid.');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key(), Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Stored compliance credential could not be decrypted.');
    }
  }
}
