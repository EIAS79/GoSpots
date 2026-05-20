/** Comma-separated WEB_ORIGIN / CORS_ORIGIN (+ optional Vercel preview hosts). */
export function parseCorsOrigins(
  ...values: (string | undefined)[]
): string[] {
  const out = new Set<string>();
  for (const raw of values) {
    if (!raw?.trim()) continue;
    for (const part of raw.split(",")) {
      const o = part.trim().replace(/\/$/, "");
      if (o) out.add(o);
    }
  }
  return [...out];
}
