/**
 * In-memory after_throttle CAPTCHA escalation.
 *
 * On public-create 429: mark (ip, surface) → requireCaptchaUntil.
 * Cross-surface: ≥2 distinct create kinds 429'd for same IP in TTL → escalate all creates.
 *
 * Enforcement still no-ops when CAPTCHA_PROVIDER=off (assertCaptchaOrThrow).
 * v1 process-local only — multi-instance needs Redis later.
 */

import {
  resolveThrottleConfig,
  type PublicThrottleKind,
} from './throttle.config';

type SurfaceUntil = Map<PublicThrottleKind, number>;

type EscalationState = {
  /** ip → surface → requireCaptchaUntil (epoch ms) */
  byIpSurface: Map<string, SurfaceUntil>;
  /** ip → requireCaptchaUntil for all public creates (cross-surface burst) */
  byIpAll: Map<string, number>;
};

const state: EscalationState = {
  byIpSurface: new Map(),
  byIpAll: new Map(),
};

/** Soft cap so a spray of IPs cannot grow unbounded in one process. */
const MAX_TRACKED_IPS = 20_000;

function ttlMsFromEnv(): number {
  return resolveThrottleConfig().ttlMs;
}

function pruneIp(ip: string, now: number): void {
  const surfaces = state.byIpSurface.get(ip);
  if (surfaces) {
    for (const [kind, until] of surfaces) {
      if (until <= now) surfaces.delete(kind);
    }
    if (surfaces.size === 0) state.byIpSurface.delete(ip);
  }
  const allUntil = state.byIpAll.get(ip);
  if (allUntil != null && allUntil <= now) state.byIpAll.delete(ip);
}

function pruneAll(now: number): void {
  for (const ip of [...state.byIpSurface.keys()]) pruneIp(ip, now);
  for (const ip of [...state.byIpAll.keys()]) {
    const until = state.byIpAll.get(ip);
    if (until != null && until <= now) state.byIpAll.delete(ip);
  }
}

function enforceCap(now: number): void {
  if (state.byIpSurface.size + state.byIpAll.size <= MAX_TRACKED_IPS) return;
  pruneAll(now);
  if (state.byIpSurface.size <= MAX_TRACKED_IPS) return;
  // Drop arbitrary oldest-ish entries (Map insertion order).
  const overflow = state.byIpSurface.size - MAX_TRACKED_IPS;
  let dropped = 0;
  for (const ip of state.byIpSurface.keys()) {
    if (dropped >= overflow) break;
    state.byIpSurface.delete(ip);
    state.byIpAll.delete(ip);
    dropped += 1;
  }
}

/**
 * Map POST path → publicThrottle kind. Chat open only (not /chats/:token/*).
 * Accepts with or without `/api/v1` prefix.
 */
export function resolvePublicCreateSurface(
  method: string,
  pathOrUrl: string,
): PublicThrottleKind | null {
  if (method.toUpperCase() !== 'POST') return null;
  const path = pathOrUrl.split('?')[0].replace(/\/+$/, '') || '/';

  if (/\/public\/venues\/[^/]+\/reviews$/i.test(path)) return 'review';
  if (/\/public\/venues\/[^/]+\/contact$/i.test(path)) return 'contact';
  if (/\/public\/venues\/[^/]+\/event-requests$/i.test(path)) return 'event';
  if (/\/public\/venues\/[^/]+\/(?:dining|gaming)\/reservations$/i.test(path)) {
    return 'booking';
  }
  if (/\/public\/venues\/[^/]+\/chats$/i.test(path)) return 'chatOpen';
  return null;
}

export function resolvePublicCreateSurfaceFromRequest(req: {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
}): PublicThrottleKind | null {
  const method = req.method ?? 'GET';
  for (const candidate of [req.originalUrl, req.url, req.path]) {
    if (!candidate) continue;
    const surface = resolvePublicCreateSurface(method, candidate);
    if (surface) return surface;
  }
  return null;
}

/**
 * Record a public-create 429 for (ip, surface). Extends requireCaptchaUntil by TTL.
 * Cross-surface burst (≥2 kinds) escalates all creates for that IP.
 */
export function notePublicThrottle429(
  ip: string,
  surface: PublicThrottleKind,
  opts?: { now?: number; ttlMs?: number },
): void {
  const trimmed = ip.trim();
  if (!trimmed) return;

  const now = opts?.now ?? Date.now();
  const ttlMs = opts?.ttlMs ?? ttlMsFromEnv();
  const until = now + ttlMs;

  pruneIp(trimmed, now);

  let surfaces = state.byIpSurface.get(trimmed);
  if (!surfaces) {
    surfaces = new Map();
    state.byIpSurface.set(trimmed, surfaces);
  }
  const prev = surfaces.get(surface) ?? 0;
  surfaces.set(surface, Math.max(prev, until));

  let activeKinds = 0;
  for (const u of surfaces.values()) {
    if (u > now) activeKinds += 1;
  }
  if (activeKinds >= 2) {
    const prevAll = state.byIpAll.get(trimmed) ?? 0;
    state.byIpAll.set(trimmed, Math.max(prevAll, until));
  }

  enforceCap(now);
}

/** True when after_throttle mode should require a token for this IP+surface. */
export function isCaptchaEscalated(
  ip: string,
  surface: PublicThrottleKind,
  opts?: { now?: number },
): boolean {
  const trimmed = ip.trim();
  if (!trimmed) return false;
  const now = opts?.now ?? Date.now();
  pruneIp(trimmed, now);

  const allUntil = state.byIpAll.get(trimmed);
  if (allUntil != null && allUntil > now) return true;

  const until = state.byIpSurface.get(trimmed)?.get(surface);
  return until != null && until > now;
}

/** Test helper — clears process-local map. */
export function resetCaptchaEscalationStoreForTests(): void {
  state.byIpSurface.clear();
  state.byIpAll.clear();
}
