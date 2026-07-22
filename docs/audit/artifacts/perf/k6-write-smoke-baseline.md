# k6 write-smoke baseline (§35 Phase 2 stub)

**Script:** [`apps/api/scripts/perf-write-smoke.js`](../../../../apps/api/scripts/perf-write-smoke.js)  
**Status:** **Destructive / staging-only** — creates real guest gaming reservations when enabled. **Not** a CI gate. **Default run is a no-op** (no `PERF_WRITE_SMOKE=1`).

## Safety gate

| Variable | Required | Purpose |
|----------|----------|---------|
| `PERF_WRITE_SMOKE` | `1` to enable | Explicit opt-in; any other value → skip writes |
| `PERF_VENUE_SLUG` | yes when enabled | Published venue slug (**never** auto-picked) |
| `PERF_RESOURCE_ID` | yes when enabled | Bookable gaming resource id on that venue |

## Scenario

| Step | Action | Notes |
|------|--------|--------|
| Setup (gated) | `GET /api/v1/ready` + `GET /public/venues/:slug` | Fails fast if venue missing |
| VU loop | `POST /public/venues/:slug/gaming/reservations` | Same `resourceId` + time window → expect **one** create + **409** overlaps |
| Outcomes | 2xx / 409 / 429 / 403 / 400 | **5xx** fail threshold; 409 = healthy contention |

Default load (when enabled): ramp **0 → 5 VUs** over **10s**, hold **30s**, ramp down **5s**.

## CAPTCHA / throttles (local only)

- **`CAPTCHA_PROVIDER=off`** (default) — no token; preferred for local/staging load.
- Live provider → set **`PERF_CAPTCHA_TOKEN`** (body) or use vendor **test keys** on localhost only — see [`GO_SPOTS_PUBLIC_ABUSE.md`](../../GO_SPOTS_PUBLIC_ABUSE.md).
- **`PUBLIC_THROTTLE_BOOKING_LIMIT`** defaults to **5/min** — raise on throwaway local API or expect **429** (still valid for abuse testing, not overlap testing).
- **`THROTTLE_DISABLED=true`** — local smoke only; **never** production.

## Record baselines here

| Date | Target | VUs / duration | creates (2xx) | overlap 409 | throttle 429 | 5xx | Notes |
|------|--------|----------------|---------------|-------------|--------------|-----|-------|
| _TBD_ | local throwaway shop | 5 / 30s steady | | | | | Purge perf reservations after run |

**SLO draft (staging):** 0% **5xx** @ target VUs; contention returns **409** (not 500). Staff reservation create + finance-under-write remain **Phase 2 residual** — see [`GO_SPOTS_PERF.md`](../../GO_SPOTS_PERF.md).
