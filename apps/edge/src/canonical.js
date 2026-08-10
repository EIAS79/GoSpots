import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function bodyHash(body) {
  return sha256(canonicalJson(body ?? {}));
}

export function signatureMessage(method, path, timestamp, nonce, hash) {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${hash}`;
}
