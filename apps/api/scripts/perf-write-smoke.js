/**
 * Bible §35 Phase 2 — minimal k6 write/contention stub (DESTRUCTIVE).
 *
 * Concurrent POST storm on `POST /api/v1/public/venues/:slug/gaming/reservations`.
 * Creates real guest reservations when slots win the lock — **staging / local only**.
 *
 * **Default: no writes.** Unless `PERF_WRITE_SMOKE=1`, setup logs a skip and the VU loop
 * is a no-op (safe to invoke via `pnpm perf:k6:write` without env).
 *
 * Requires k6 CLI (https://k6.io/docs/get-started/installation/) — not bundled in repo.
 *
 * Opt-in env (all required when enabled):
 *   PERF_WRITE_SMOKE=1       — explicit gate; omit or any other value → skip writes
 *   PERF_VENUE_SLUG          — published venue slug (never auto-picked)
 *   PERF_RESOURCE_ID         — bookable gaming resource id (cuid) on that venue
 *
 * API / load tuning (local staging only — never prod defaults):
 *   API_URL                  — API origin (default http://127.0.0.1:4000)
 *   PERF_STARTS_AT           — ISO start (default: +7d 14:00 UTC, contention window)
 *   PERF_ENDS_AT             — ISO end (default: +7d 15:00 UTC)
 *   PERF_CAPTCHA_TOKEN       — body `captchaToken` when CAPTCHA_PROVIDER ≠ off
 *   K6_VUS                   — concurrent writers (default 5; throttle-aware)
 *   K6_RAMP_DURATION         — ramp to steady VUs (default 10s)
 *   K6_STEADY_DURATION       — hold at steady VUs (default 30s)
 *
 * CAPTCHA / throttles (see docs/audit/GO_SPOTS_PUBLIC_ABUSE.md):
 *   - Default `CAPTCHA_PROVIDER=off` → no token needed.
 *   - Live Turnstile/hCaptcha will 403 without a valid token — use vendor test keys locally only.
 *   - `PUBLIC_THROTTLE_BOOKING_LIMIT` defaults to 5/min — raise locally for load or expect 429s.
 *   - `THROTTLE_DISABLED=true` is for local smoke only; **never** in production.
 *
 * Run (destructive — seeded throwaway shop only):
 *   PERF_WRITE_SMOKE=1 PERF_VENUE_SLUG=demo-venue PERF_RESOURCE_ID=clxxx... \
 *     pnpm --filter @gospots/api run perf:k6:write
 *
 * Safe no-op (default):
 *   pnpm --filter @gospots/api run perf:k6:write
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const serverErrors = new Counter('server_errors');

const WRITE_ENABLED = __ENV.PERF_WRITE_SMOKE === '1';
const VENUE_SLUG = (__ENV.PERF_VENUE_SLUG || '').trim();
const RESOURCE_ID = (__ENV.PERF_RESOURCE_ID || '').trim();
const CAPTCHA_TOKEN = (__ENV.PERF_CAPTCHA_TOKEN || '').trim();

const STEADY_VUS = Math.max(1, parseInt(__ENV.K6_VUS || '5', 10) || 5);
const RAMP = __ENV.K6_RAMP_DURATION || '10s';
const STEADY = __ENV.K6_STEADY_DURATION || '30s';

function defaultSlotIso() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 7);
  start.setUTCHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

const SLOT = {
  startsAt: (__ENV.PERF_STARTS_AT || '').trim() || defaultSlotIso().startsAt,
  endsAt: (__ENV.PERF_ENDS_AT || '').trim() || defaultSlotIso().endsAt,
};

export const options = {
  scenarios: {
    public_write_smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: WRITE_ENABLED ? STEADY_VUS : 1 },
        { duration: WRITE_ENABLED ? STEADY : '1s', target: WRITE_ENABLED ? STEADY_VUS : 1 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: WRITE_ENABLED
    ? {
        server_errors: ['count==0'],
        http_req_duration: ['p(95)<5000'],
      }
    : {},
};

function resolveApiV1Base() {
  const raw = (__ENV.API_URL || __ENV.PERF_BASE_URL || 'http://127.0.0.1:4000').trim();
  const withoutReady = raw.replace(/\/ready\/?$/, '');
  if (withoutReady.endsWith('/api/v1')) {
    return withoutReady;
  }
  const origin = withoutReady.replace(/\/$/, '');
  return `${origin}/api/v1`;
}

const API_V1 = resolveApiV1Base();
const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function apiPath(suffix) {
  return `${API_V1}${suffix}`;
}

function bookingPayload(vu, iter) {
  const body = {
    resourceId: RESOURCE_ID,
    guestName: `Perf K6 VU${vu}`,
    guestEmail: `perf-k6-vu${vu}-iter${iter}@example.invalid`,
    partySize: 2,
    startsAt: SLOT.startsAt,
    endsAt: SLOT.endsAt,
    privacyConsentAccepted: true,
    notes: 'perf-write-smoke §35 Phase 2 stub — safe to purge',
  };
  if (CAPTCHA_TOKEN) {
    body.captchaToken = CAPTCHA_TOKEN;
  }
  return JSON.stringify(body);
}

export function setup() {
  if (!WRITE_ENABLED) {
    console.warn(
      '[perf-write-smoke] SKIPPED — destructive writes disabled. Set PERF_WRITE_SMOKE=1, PERF_VENUE_SLUG, and PERF_RESOURCE_ID on a throwaway staging shop to run.',
    );
    return { skip: true };
  }

  if (!VENUE_SLUG) {
    throw new Error(
      'PERF_VENUE_SLUG is required when PERF_WRITE_SMOKE=1 (never auto-picked — staging-only slug).',
    );
  }
  if (!RESOURCE_ID) {
    throw new Error(
      'PERF_RESOURCE_ID is required when PERF_WRITE_SMOKE=1 (bookable gaming resource cuid on that venue).',
    );
  }

  const readyRes = http.get(apiPath('/ready'), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'ready' },
  });
  const readyOk = check(readyRes, {
    'setup ready status 200': (r) => r.status === 200,
  });
  if (!readyOk) {
    throw new Error(
      `ready probe failed (${readyRes.status}): ${String(readyRes.body).slice(0, 200)}`,
    );
  }

  const venueRes = http.get(apiPath(`/public/venues/${encodeURIComponent(VENUE_SLUG)}`), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'venue_detail' },
  });
  if (venueRes.status !== 200) {
    throw new Error(
      `venue ${VENUE_SLUG} not reachable (${venueRes.status}): ${String(venueRes.body).slice(0, 200)}`,
    );
  }

  console.warn(
    `[perf-write-smoke] ENABLED — will POST gaming reservations to slug=${VENUE_SLUG} resource=${RESOURCE_ID} window=${SLOT.startsAt} → ${SLOT.endsAt}. Purge test rows after run.`,
  );

  return { skip: false, slug: VENUE_SLUG };
}

export default function writeSmoke(data) {
  if (data.skip) {
    return;
  }

  const res = http.post(
    apiPath(`/public/venues/${encodeURIComponent(data.slug)}/gaming/reservations`),
    bookingPayload(__VU, __ITER),
    {
      headers: JSON_HEADERS,
      tags: { endpoint: 'gaming_booking_create' },
    },
  );

  const status = res.status;
  const isServerError = status >= 500;
  if (isServerError) {
    // 409/429/403 are expected under contention/abuse gates — only 5xx fail the threshold.
    serverErrors.add(1);
  }

  check(res, {
    'not a server error (5xx)': (r) => r.status < 500,
    'created or expected contention/abuse outcome': (r) =>
      (r.status >= 200 && r.status < 300) ||
      r.status === 409 ||
      r.status === 429 ||
      r.status === 403 ||
      r.status === 400,
  });

  sleep(0.2);
}
