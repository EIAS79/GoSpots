/**
 * Bible §35 Phase 1 — minimal k6 read-scenario stub.
 *
 * Requires k6 CLI (https://k6.io/docs/get-started/installation/) — not bundled in repo.
 *
 * Env:
 *   API_URL          — API origin (default http://127.0.0.1:4000)
 *   PERF_BASE_URL    — alias; full /api/v1/ready URL also accepted
 *   PERF_VENUE_SLUG  — optional fixed slug for GET /public/venues/:slug (auto-picked from list when omitted)
 *   K6_VUS           — steady VUs after ramp (default 10)
 *   K6_RAMP_DURATION — ramp to steady VUs (default 30s)
 *   K6_STEADY_DURATION — hold at steady VUs (default 2m)
 *
 * Run:
 *   k6 run apps/api/scripts/perf-read-smoke.js
 *   API_URL=http://127.0.0.1:4000 pnpm --filter @gospots/api run perf:k6
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const STEADY_VUS = Math.max(1, parseInt(__ENV.K6_VUS || '10', 10) || 10);
const RAMP = __ENV.K6_RAMP_DURATION || '30s';
const STEADY = __ENV.K6_STEADY_DURATION || '2m';

export const options = {
  scenarios: {
    public_read_smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: STEADY_VUS },
        { duration: STEADY, target: STEADY_VUS },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:ready}': ['p(95)<500'],
    'http_req_duration{endpoint:venues_list}': ['p(95)<500'],
  },
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
const FIXED_SLUG = (__ENV.PERF_VENUE_SLUG || '').trim();
const JSON_HEADERS = { Accept: 'application/json' };

function apiPath(suffix) {
  return `${API_V1}${suffix}`;
}

export function setup() {
  const readyRes = http.get(apiPath('/ready'), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'ready' },
  });
  const readyOk = check(readyRes, {
    'setup ready status 200': (r) => r.status === 200,
    'setup ready body ok': (r) => {
      try {
        return JSON.parse(r.body).status === 'ok';
      } catch {
        return false;
      }
    },
  });
  if (!readyOk) {
    throw new Error(
      `ready probe failed (${readyRes.status}): ${String(readyRes.body).slice(0, 200)}`,
    );
  }

  let slug = FIXED_SLUG;
  if (!slug) {
    const venuesRes = http.get(apiPath('/public/venues'), {
      headers: JSON_HEADERS,
      tags: { endpoint: 'venues_list' },
    });
    if (venuesRes.status === 200) {
      try {
        const data = JSON.parse(venuesRes.body);
        const first = data.items && data.items[0];
        if (first) {
          slug = first.slug || first.venuePath || '';
        }
      } catch {
        // no slug — venue detail step skipped in default()
      }
    }
  }

  return { slug };
}

export default function readSmoke(data) {
  const readyRes = http.get(apiPath('/ready'), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'ready' },
  });
  check(readyRes, {
    'ready status 200': (r) => r.status === 200,
    'ready database up': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok' && body.database === 'up';
      } catch {
        return false;
      }
    },
  });

  const venuesRes = http.get(apiPath('/public/venues'), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'venues_list' },
  });
  check(venuesRes, {
    'venues list status 200': (r) => r.status === 200,
    'venues list has items array': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body).items);
      } catch {
        return false;
      }
    },
  });

  if (data.slug) {
    const detailRes = http.get(
      apiPath(`/public/venues/${encodeURIComponent(data.slug)}`),
      {
        headers: JSON_HEADERS,
        tags: { endpoint: 'venue_detail' },
      },
    );
    check(detailRes, {
      'venue detail status 200': (r) => r.status === 200,
    });
  }

  sleep(0.5);
}
