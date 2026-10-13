/** Explicit KSeF v2 venue-environment routing: never silently redirect PRD to TEST. */
export type KsefEnvironment = 'TEST' | 'DEMO' | 'PRD';
const BASE: Record<KsefEnvironment, string> = {
  TEST: 'https://api-test.ksef.mf.gov.pl/v2',
  DEMO: 'https://api-demo.ksef.mf.gov.pl/v2',
  PRD: 'https://api.ksef.mf.gov.pl/v2',
};
const OFFICIAL = new Map(
  (Object.entries(BASE) as [KsefEnvironment, string][]).map(([env, url]) => [
    new URL(url).hostname,
    env,
  ]),
);
export function resolveKsefEndpoint(
  rawEnv: string,
  rawOverride?: string | null,
): { env: KsefEnvironment; baseUrl: string } {
  const normalized = rawEnv.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(BASE, normalized)) {
    throw new Error('Unsupported KSeF environment; expected TEST, DEMO or PRD');
  }
  const env = normalized as KsefEnvironment;
  if (!rawOverride?.trim()) return { env, baseUrl: BASE[env] };
  let url: URL;
  try {
    url = new URL(rawOverride.trim());
  } catch {
    throw new Error('KSeF endpoint override must be an absolute HTTPS URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/+$/, '') !== '/v2'
  ) {
    throw new Error(
      'KSeF endpoint override must use HTTPS /v2 with no credentials or query',
    );
  }
  const officialEnv = OFFICIAL.get(url.hostname.toLowerCase());
  if (officialEnv && officialEnv !== env) {
    throw new Error('Cross-environment KSeF endpoint routing denied');
  }
  if (!officialEnv || url.port) {
    throw new Error(
      'Unapproved KSeF proxy; only the matching official gateway is allowed',
    );
  }
  return { env, baseUrl: url.href.replace(/\/+$/, '') };
}
