import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
} from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { bodyHash, signatureMessage } from './canonical.js';

function decodeConfiguredKey(raw) {
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  return decoded.length === 32 ? decoded : null;
}

export function loadOrCreateMasterKey(path, configured = process.env.EDGE_MASTER_KEY) {
  const configuredKey = decodeConfiguredKey(configured);
  if (configured && !configuredKey) throw new Error('EDGE_MASTER_KEY must be 32 bytes encoded as hex or base64');
  if (configuredKey) return configuredKey;
  if (existsSync(path)) {
    const key = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64');
    if (key.length !== 32) throw new Error(`Invalid Edge master key file: ${path}`);
    return key;
  }
  const key = randomBytes(32);
  writeFileSync(path, key.toString('base64'), { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* Windows does not provide POSIX mode guarantees. */ }
  return key;
}

export function encryptSecret(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(encoded, key) {
  const [version, ivB64, tagB64, cipherB64] = String(encoded).split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !cipherB64) throw new Error('Unsupported encrypted secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]).toString('utf8');
}

export function generateCloudKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function signCloudRequest(privateKeyPem, method, path, body, timestamp, nonce) {
  const message = signatureMessage(method, path, timestamp, nonce, bodyHash(body));
  return sign(null, Buffer.from(message), privateKeyPem).toString('base64');
}

export function signLanRequest(secret, method, path, body, timestamp, nonce) {
  const message = signatureMessage(method, path, timestamp, nonce, bodyHash(body));
  return createHmac('sha256', secret).update(message).digest('base64');
}

export function verifyLanSignature(secret, signature, method, path, body, timestamp, nonce) {
  const expected = Buffer.from(signLanRequest(secret, method, path, body, timestamp, nonce), 'base64');
  let actual;
  try { actual = Buffer.from(signature, 'base64'); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
