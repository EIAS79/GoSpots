#!/usr/bin/env node
/**
 * Lightweight §35 perf smoke — readiness latency + one public read hotspot.
 * Run from apps/api: `node scripts/perf-smoke.mjs` or `pnpm perf:smoke`
 *
 * Env:
 *   PERF_BASE_URL      — readiness URL (default http://127.0.0.1:3001/api/v1/ready)
 *   PERF_HOTSPOT_URL   — optional public read (default {origin}/api/v1/public/venues)
 *   PERF_REQUESTS      — sample size per target (default 50)
 *   PERF_SKIP_HOTSPOT  — set to 1 to skip hotspot probe
 */
const READY_URL =
  process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3001/api/v1/ready';
const REQUESTS = Math.max(
  1,
  parseInt(process.env.PERF_REQUESTS ?? '50', 10) || 50,
);
const SKIP_HOTSPOT = process.env.PERF_SKIP_HOTSPOT === '1';

function hotspotUrl() {
  if (process.env.PERF_HOTSPOT_URL) return process.env.PERF_HOTSPOT_URL;
  const ready = new URL(READY_URL);
  return `${ready.protocol}//${ready.host}/api/v1/public/venues`;
}

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.min(Math.max(rank, 0), sortedMs.length - 1)];
}

async function probe(url, label) {
  const started = performance.now();
  let status = 0;
  let ok = false;
  let detail = '';
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    status = res.status;
    ok = res.ok;
    if (!ok) {
      detail = (await res.text()).slice(0, 200);
    } else if (label === 'ready') {
      const body = await res.json().catch(() => null);
      if (body && body.status !== 'ok') {
        ok = false;
        detail = JSON.stringify(body).slice(0, 200);
      }
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  return { ms: performance.now() - started, ok, status, detail };
}

async function runSeries(url, label) {
  const latencies = [];
  let failures = 0;
  for (let i = 0; i < REQUESTS; i += 1) {
    const sample = await probe(url, label);
    latencies.push(sample.ms);
    if (!sample.ok) failures += 1;
  }
  latencies.sort((a, b) => a - b);
  return {
    label,
    url,
    count: REQUESTS,
    failures,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    min: latencies[0] ?? 0,
    max: latencies[latencies.length - 1] ?? 0,
  };
}

function printSummary(row) {
  console.log(
    `[${row.label}] ${row.url}\n` +
      `  requests=${row.count} failures=${row.failures} ` +
      `p50=${row.p50.toFixed(1)}ms p95=${row.p95.toFixed(1)}ms ` +
      `min=${row.min.toFixed(1)}ms max=${row.max.toFixed(1)}ms`,
  );
}

console.log(`perf-smoke: ready=${READY_URL} n=${REQUESTS}`);

const firstReady = await probe(READY_URL, 'ready');
if (!firstReady.ok) {
  console.error(
    `FAIL ready probe status=${firstReady.status} latency=${firstReady.ms.toFixed(1)}ms` +
      (firstReady.detail ? ` — ${firstReady.detail}` : ''),
  );
  process.exit(1);
}

const readyStats = await runSeries(READY_URL, 'ready');
printSummary(readyStats);

if (readyStats.failures > 0) {
  console.error(`FAIL ready series had ${readyStats.failures}/${REQUESTS} errors`);
  process.exit(1);
}

if (!SKIP_HOTSPOT) {
  const hotUrl = hotspotUrl();
  const hotspotStats = await runSeries(hotUrl, 'hotspot');
  printSummary(hotspotStats);
  if (hotspotStats.failures > 0) {
    console.warn(
      `WARN hotspot had ${hotspotStats.failures}/${REQUESTS} errors (ready passed; not failing exit)`,
    );
  }
}

console.log('perf-smoke: PASS (ready healthy)');
