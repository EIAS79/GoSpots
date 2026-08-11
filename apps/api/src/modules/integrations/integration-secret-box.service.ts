import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

@Injectable()
export class IntegrationSecretBoxService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const raw = this.config.get<string>('INTEGRATION_SECRET_ENCRYPTION_KEY')?.trim();
    if (!raw) {
      throw new ServiceUnavailableException(
        'Integration secret encryption is not configured',
      );
    }
    const key = /^[a-f0-9]{64}$/i.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'INTEGRATION_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes',
      );
    }
    return key;
  }

  encrypt(value: unknown): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      keyVersion: 1,
    };
  }

  decrypt<T>(input: EncryptedSecret): T {
    if (input.keyVersion !== 1) {
      throw new ServiceUnavailableException('Unsupported integration secret key version');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(input.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(input.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  }
}
