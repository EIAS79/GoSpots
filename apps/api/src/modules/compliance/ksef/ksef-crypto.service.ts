import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createHash,
  publicEncrypt,
  randomBytes,
  constants,
} from 'crypto';

export type KsefEncryptionMaterial = {
  key: Buffer;
  iv: Buffer;
  encryptedSymmetricKey: string;
  initializationVector: string;
  publicKeyId?: string;
};

export type KsefEncryptedInvoice = {
  encrypted: Buffer;
  invoiceHash: string;
  invoiceSize: number;
  encryptedInvoiceHash: string;
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string;
};

function sha256Base64(data: Buffer): string {
  return createHash('sha256').update(data).digest('base64');
}

@Injectable()
export class KsefCryptoService {
  private rsaOaepSha256(publicKeyPem: string, value: Buffer): Buffer {
    return publicEncrypt(
      {
        key: publicKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      value,
    );
  }

  createSessionMaterial(publicKeyPem: string, publicKeyId?: string): KsefEncryptionMaterial {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const encryptedKey = this.rsaOaepSha256(publicKeyPem, key);
    return {
      key,
      iv,
      encryptedSymmetricKey: encryptedKey.toString('base64'),
      initializationVector: iv.toString('base64'),
      ...(publicKeyId?.trim() ? { publicKeyId: publicKeyId.trim() } : {}),
    };
  }

  encryptKsefToken(publicKeyPem: string, token: string, timestampMs: number): string {
    const plaintext = Buffer.from(`${token}|${timestampMs}`, 'utf8');
    return this.rsaOaepSha256(publicKeyPem, plaintext).toString('base64');
  }

  encryptInvoice(xml: Buffer, material: Pick<KsefEncryptionMaterial, 'key' | 'iv'>): KsefEncryptedInvoice {
    const cipher = createCipheriv('aes-256-cbc', material.key, material.iv);
    // Node's AES-CBC auto padding is PKCS#7-compatible for a 16-byte block size.
    const encrypted = Buffer.concat([cipher.update(xml), cipher.final()]);
    return {
      encrypted,
      invoiceHash: sha256Base64(xml),
      invoiceSize: xml.length,
      encryptedInvoiceHash: sha256Base64(encrypted),
      encryptedInvoiceSize: encrypted.length,
      encryptedInvoiceContent: encrypted.toString('base64'),
    };
  }

  hashText(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
