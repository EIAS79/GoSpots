# Disaster recovery

**Status:** Ship bar met for bible **#24** (documented procedures). Live Neon PITR / retention values and restore-drill date remain **OPERATOR** fill-ins — confirm in the Neon console before relying on this in an incident.

**Ship bar (code/docs):** clear Postgres restore paths · API/Web re-point order · post-restore verify · RTO/RPO guidance · restore-drill checklist · partial-outage runbook (+ in-app mirror). Not required for DONE: automated backup job, app-level upload backup, or filled TBD fields from a live console.

## Scope

| In scope | Out of scope (v1) |
|----------|-------------------|
| Neon Postgres restore (PITR / branch) | Object storage / local `uploads` backup |
| Render API `DATABASE_URL` swap + migrate | Partial single-table restore |
| Vercel web re-point / redeploy | Automated nightly restore verification job |
| Health probes + secret rotation guidance | Multi-region active-active |

## Targets (guidance — set after first drill)

| Metric | Suggested v1 target | Notes |
|--------|---------------------|-------|
| **RPO** (max data loss) | ≤ Neon history retention for the paid plan (often **hours–days**) | Bound by Neon PITR window; confirm in console |
| **RTO** (time to serve again) | ≤ **2 hours** for DB+API swap + `/ready` green | First drill will calibrate; update after practice |

Document your accepted RPO/RTO next to the project record below once confirmed.

## Database (Neon)

### Pre-incident checklist (do once, before Friday smoke if possible)

1. Open the **production** Neon project → **Settings / Restore** (labels vary by Neon UI).
2. Confirm **point-in-time restore** or **history retention** is enabled for this project.
3. If PITR is off or retention is shorter than your RPO, **enable or upgrade before an incident** — not during one.
4. Record verified values here (OPERATOR — never paste connection strings or passwords):

| Field | Value |
|-------|--------|
| Neon project id / name | `mute-butterfly-69488238` / `Gospots` |
| PITR / history retention | **6 hours** (Settings → History window; Free plan max) |
| Accepted RPO / RTO | RPO ≤ **6 hours**; RTO ≤ **2 hours** (guidance until first drill) |
| Last restore drill date | `_never_` |
| Drill outcome (pass/fail + notes) | `_TBD_` |

### Restore options (incident)

Typical Neon flows — confirm UI labels on the live project:

1. **Branch from timestamp** — create a branch at a known-good point-in-time; use its connection string for the API.
2. **Restore into a new database** — restore, then swap Render `DATABASE_URL` to the new endpoint.
3. Prefer a **new branch / DB** over in-place overwrite so you can keep the broken primary for forensics.

### After restore (ordered)

1. Set Render `DATABASE_URL` to the restored connection string (`?sslmode=require`).
2. Restart / redeploy the API so pools pick up the new URL.
3. Run `pnpm --filter @gospots/api migrate:deploy` **only if** the restored DB is behind migrations. **Never** `prisma migrate reset` in production.
4. Optionally run `pnpm --filter @gospots/api run verify:migrations` (read-only disk ↔ `_prisma_migrations`).
5. Hit **`GET /api/v1/ready`** until `database: up`. Do **not** trust `/live` or `/health` alone (liveness OK while Postgres is down).
6. Smoke: owner login + CSRF, one book path, guest status link, one stock+sale if time allows (see [`DEPLOY_CHECKLIST.md`](../audit/DEPLOY_CHECKLIST.md)).

## API / Web

- **Load-balancer health check:** **`GET /api/v1/ready`** (DB connectivity). `/live` and `/health` are liveness-only.
- **Secrets:** if the incident involved credential exposure, rotate Neon password, JWT secrets, Lemon Squeezy webhook secret, MFA encryption key. Do not paste secrets into this doc.
- **Web (Vercel):** redeploy once API URL / DNS is correct; confirm `WEB_ORIGIN`, `API_PROXY_TARGET`, and `CORS_ORIGINS`.
- **Cookies / CSRF:** after URL or proxy changes, re-check Secure / SameSite behind the proxy (not a DB outage — mode **D**).

## Restore drill (practice — OPERATOR)

Run at least once before treating DR as proven. Prefer a **non-prod** Neon branch or a disposable project.

| Step | Action | Pass? |
|------|--------|-------|
| 1 | Create branch / restore to a timestamp ~1h ago | ☐ |
| 2 | Point a staging API at the branch `DATABASE_URL` | ☐ |
| 3 | `migrate:deploy` only if behind; never reset | ☐ |
| 4 | `/ready` → database up | ☐ |
| 5 | Login + one read path (reservations or finance list) | ☐ |
| 6 | Record date + notes in the table above | ☐ |

Failure modes to note: wrong SSL mode, pooler vs direct URL, migrations ahead of restored schema, webhook secret mismatch after URL change.

## Partial-outage runbook (live degradation)

App UX modes (bible #32): **A** browser offline · **B** API unreachable · **C** API up / DB down · **F** stale poll. Staff see `OfflineBanner`; public booking/chat disable writes on A–C. Money/booking writes never queue offline.

**In-app:** owner **Shop settings → Outage runbook** (`OpsOutageRunbookPanel`) mirrors the table below (en/pl).

| Symptom | Likely cause | First actions |
|---------|--------------|---------------|
| `/ready` **503**, `/live` **200** | Postgres / Neon | Check Neon status; verify `DATABASE_URL`; restart API after DB recovers; **never** `migrate reset` |
| Web loads, all API **503** “proxy not configured” | Vercel `API_PROXY_TARGET` missing | Set to Render API URL; redeploy web |
| Web **502**, API `/live` OK | Proxy / wrong upstream URL | Verify Render URL, SSL, `CORS_ORIGINS` / `WEB_ORIGIN` |
| API OK but emails missing / stuck | Resend outage or dead outbox | Resend dashboard; owner Settings → mail outbox dead-letter retry (`#22`); system-mail null-shopId is ops-only |
| Subscription webhooks failing | Lemon secret / URL | Rotate webhook secret; replay from Lemon; handler is idempotent (`#8`) |
| Staff “session expired” spike | JWT / cookie / clock | Cookie `Secure`/SameSite behind proxy — **not** a DB outage (mode **D**, not A–C) |
| Duplicate reminder / no-show mail | Multi-instance cron without lock | Confirm advisory-lock path deployed; single-flight on reminders + mail outbox |
| CAPTCHA / public 429 storms | Abuse or mis-tuned throttle | Keep `CAPTCHA_PROVIDER=off` until keys set; do **not** set `THROTTLE_DISABLED` in prod |

**Communication:** in-app connectivity banner is enough for v1; for prolonged mode **C** during open hours, venue operators notify guests out-of-band. Full restore / PITR remains this doc’s Database section.

## Explicit residuals (not blockers for #24 DONE)

- Live Neon project TBD fields (project id, retention, last drill) — **OPERATOR**
- Automated backup verification cron
- Upload / media object-storage backup
- Documented partial-table restore

## Related

- [`docs/audit/DEPLOY_CHECKLIST.md`](../audit/DEPLOY_CHECKLIST.md) — Friday migrate + smoke
- [`docs/audit/REMAINING_P0_FRIDAY.md`](../audit/REMAINING_P0_FRIDAY.md) — operator blockers
- [`docs/audit/GO_SPOTS_OFFLINE.md`](../audit/GO_SPOTS_OFFLINE.md) — failure taxonomy + UX modes
- [`docs/audit/BIBLE_STATUS.md`](../audit/BIBLE_STATUS.md) — bible #24
- `docs/DEPLOYMENT.md` — Neon + Render setup
- `docs/DATABASE.md` — schema / migration notes
