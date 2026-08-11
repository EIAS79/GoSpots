import { createHash, createHmac } from 'node:crypto';

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacOpaque(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const PII_KEY = /(email|phone|name|address|token|secret|password|uid|card|customer)/i;
export function redactProviderInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderInput);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = PII_KEY.test(key) ? '[REDACTED]' : redactProviderInput(item);
  }
  return out;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = /(secret|token|password|key|authorization|cookie)/i.test(key)
      ? '[REDACTED]'
      : redactSecrets(item);
  }
  return out;
}
