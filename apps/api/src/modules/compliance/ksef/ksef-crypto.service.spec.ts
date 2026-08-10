import { createDecipheriv, generateKeyPairSync, privateDecrypt, constants } from 'crypto';
import { KsefCryptoService } from './ksef-crypto.service';

describe('KsefCryptoService', () => {
  test('creates 256-bit key, 128-bit IV, RSA-OAEP SHA-256 and AES-256-CBC invoice payload', () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const crypto = new KsefCryptoService();
    const material = crypto.createSessionMaterial(publicPem, 'key-2026');

    expect(material.key).toHaveLength(32);
    expect(material.iv).toHaveLength(16);
    expect(material.publicKeyId).toBe('key-2026');

    const recoveredKey = privateDecrypt(
      {
        key: pair.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(material.encryptedSymmetricKey, 'base64'),
    );
    expect(recoveredKey.equals(material.key)).toBe(true);

    const xml = Buffer.from('<Faktura><P_2>FV/1/2026</P_2></Faktura>', 'utf8');
    const encrypted = crypto.encryptInvoice(xml, material);
    expect(encrypted.invoiceSize).toBe(xml.length);
    expect(encrypted.encryptedInvoiceContent).toBe(encrypted.encrypted.toString('base64'));

    const decipher = createDecipheriv('aes-256-cbc', material.key, material.iv);
    const plain = Buffer.concat([decipher.update(encrypted.encrypted), decipher.final()]);
    expect(plain.equals(xml)).toBe(true);
  });
});
