# k6 read-smoke baseline (§35 Phase 1 stub)

**Script:** [`apps/api/scripts/perf-read-smoke.js`](../../../../apps/api/scripts/perf-read-smoke.js)  
**Status:** Stub only — operator records numbers after local/staging runs. **Not** a CI gate.

## Scenario

| Step | Endpoint | Notes |
|------|----------|--------|
| Setup probe | `GET /api/v1/ready` | Fails fast if DB down |
| Setup pick slug | `GET /api/v1/public/venues` | First item slug, or `PERF_VENUE_SLUG` |
| VU loop | `GET /api/v1/ready` | DB ping |
| VU loop | `GET /api/v1/public/venues` | Directory + review stats |
| VU loop (optional) | `GET /api/v1/public/venues/:slug` | When slug known |

Default load: ramp **0 → 10 VUs** over **30s**, hold **2m**, ramp down **15s**.

## Record baselines here

| Date | Target | VUs / duration | ready p95 | venues p95 | venue_detail p95 | error rate | Notes |
|------|--------|----------------|-----------|------------|------------------|------------|-------|
| _TBD_ | local Docker | 10 / 2m steady | | | | | API + Postgres seeded |

**SLO draft (local):** public read p95 &lt; 500 ms @ 10 VUs; error rate &lt; 1%.

Staff read mix (schedule, notifications) and write scenarios remain **Phase 2+** — see [`GO_SPOTS_PERF.md`](../../GO_SPOTS_PERF.md). Public gaming POST contention stub: [`k6-write-smoke-baseline.md`](./k6-write-smoke-baseline.md) (**opt-in / destructive**).
