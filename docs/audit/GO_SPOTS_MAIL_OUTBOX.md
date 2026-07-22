# Locora — Mail outbox (Bible §22 / #22)

**Date:** 2026-07-20 (stub Lane E) / 2026-07-21 (durable slice Lanes SS → ZZZZ → TTTTT) / 2026-07-22 (residual docs lane **MAIL22-residual-docs**)  
**Status:** **Bible #22 / §22 PARTIAL** — durable outbox + minute worker + owner dead-letter UI + SUPER_ADMIN system-mail ops = **DONE** ship bar (code). **Prod retry proof** and outbox alerting/metrics remain **OPERATOR / deferred** — phased checklist below.  
**Audit:** P1/P2 §2.22 / original prompt **§22** (email + background jobs).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Expand-only `MailOutbox` table (migration #8) | **DONE** | `20260721020000_mail_outbox` |
| Persist-first enqueue on every `MailService.send` | **DONE** | `mail-outbox.service.ts`; sync path unchanged for callers |
| Sync deliver + status transitions (SENT / FAILED+backoff / SKIPPED / DEAD) | **DONE** | `mail.service.ts`; max **8** attempts → DEAD |
| Sync grace (`nextAttemptAt = now + 120s`) | **DONE** | avoids worker racing in-flight sync |
| Minute cron worker + GS/MO advisory lock (batch 20) | **DONE** | `mail-outbox.processor.ts`; `withMailOutboxCronLock` |
| Optional `idempotencyKey` dedupe | **DONE** | unique index on table |
| Owner dead-letter API (`GET /mail/outbox/dead`, `POST …/retry`) | **DONE** | Lane XXXX; shop-scoped; no html/text in list |
| Owner settings dead-letter panel | **DONE** | Lane ZZZZ; `mail-outbox-panel.tsx` |
| SUPER_ADMIN system-mail ops (`shopId IS NULL`) | **DONE** | Lane TTTTT; `/admin` `SystemMailOutboxPanel` |
| Unit tests (outbox service + processor + advisory lock) | **DONE** | jest mail-outbox + pg-advisory-lock **18** PASS (ship log) |
| Deploy docs (migration #8 ordering) | **DONE** | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) · [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) |
| **Prod retry proof** (Resend outage → row retries → SENT) | **OPERATOR** | code ready; **not executed** on live Neon + Resend |
| Outbox depth / DEAD growth **alerting** | **RESIDUAL** | no gauges wired; optional Phase 4 in [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) |
| Outbox row **retention / purge** job | **DONE** (opt-in) | `MailOutboxRetentionProcessor` daily 04:00 UTC + GS/MR lock; `MAIL_OUTBOX_SENT_RETENTION_CRON=on` to enable; default **90d** via `sentAt` |
| Separate job runner / queue (Bull, SQS) | **RESIDUAL** (intentionally avoided) | Nest `@Cron` + Postgres outbox pattern |
| Email OTP / per-login MFA mail pipeline | **OUT OF SCOPE §22** | §12 chose owner TOTP — see [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md) |

**§22 classification:** **PARTIAL** — Friday ship bar met (durable retry path + ops UI); live prod proof and observability polish documented here, not hidden.

**Related background jobs (not mail-outbox):** reservation reminders cron (`reservation-reminders.service.ts`, minute, advisory lock) and GDPR retention cron (`gdpr-retention.processor.ts`, daily) ship separately; they **enqueue through** `MailService.send` when mail is involved.

---

## Problem

`MailService.send` historically called Resend synchronously. Transient HTTP failures, cold starts, and unconfigured prod keys lost the send with no durable retry. Call sites (auth, reservations) mostly try/catch and continue — guests never got a follow-up email.

## Architecture (Lane SS+)

```
caller → MailService.send → MailOutboxService.enqueue (DB PENDING, payload JSON)
                                      ↓
                         sync deliverPayload (Resend)
                              SENT | FAILED + backoff | SKIPPED
                                      ↓
              MailOutboxProcessor @Cron EVERY_MINUTE
              (pg_try_advisory_xact_lock GS/MO, max 20/tick)
                                      ↓
                         retry PENDING|FAILED where nextAttemptAt <= now
```

- **Persist first:** every `send` writes a `MailOutbox` row before Resend.
- **Sync path still works:** callers get the same success/throw semantics.
- **Sync grace:** new rows set `nextAttemptAt = now + 120s` so the worker does not race the in-flight sync attempt; orphaned PENDING after crash becomes due for worker retry.
- **No call-site rewrites:** auth / finance / reservations unchanged.

## Table (migration `20260721020000_mail_outbox`)

| Column | Notes |
|--------|--------|
| `status` | `PENDING` \| `SENT` \| `FAILED` \| `DEAD` \| `SKIPPED` |
| `attempts` | incremented on each failure |
| `nextAttemptAt` | worker claim + backoff |
| `idempotencyKey` | optional unique dedupe |
| `payload` | JSON `{ to, subject, html, text, required? }` |
| `shopId` | nullable (system mail) |

Max attempts → `DEAD` (`MAIL_OUTBOX_MAX_ATTEMPTS = 8`).

Backoff after failure: 1m → 5m → 15m → 1h → 6h (capped).

## Worker

- Nest `@Cron(EVERY_MINUTE)` on `MailOutboxProcessor.tick`
- Single-flight via `withMailOutboxCronLock` (`pg-advisory-lock.util`, keys GS/MO)
- Batch: `MAIL_OUTBOX_BATCH_SIZE` (20)
- Schema-missing fail-open: logs warning if migration not applied (dev safety)

## Dead-letter API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| `GET` | `/mail/outbox/dead` | OWNER | Venue counts + DEAD list; `?includeFailed=1`; no html/text |
| `POST` | `/mail/outbox/:id/retry` | OWNER | Shop-scoped DEAD → PENDING |
| `GET` | `/mail/outbox/system/dead` | SUPER_ADMIN | `shopId IS NULL` only |
| `POST` | `/mail/outbox/system/:id/retry` | SUPER_ADMIN | System DEAD → PENDING |

## Files

| Path | Role |
|------|------|
| `apps/api/prisma/migrations/20260721020000_mail_outbox/` | Expand-only table |
| `apps/api/src/modules/mail/mail-outbox.service.ts` | enqueue / mark* / dead-letter list+requeue (+ `systemOnly`) |
| `apps/api/src/modules/mail/mail-outbox.processor.ts` | cron worker (retry) |
| `apps/api/src/modules/mail/mail-outbox-retention.processor.ts` | daily SENT retention purge (opt-in) |
| `apps/api/src/modules/mail/mail-outbox.controller.ts` | owner + SUPER_ADMIN dead-letter list + retry |
| `apps/web/src/lib/mail-outbox-client.ts` | venue + system dead-letter clients |
| `apps/web/src/components/settings/mail-outbox-panel.tsx` | owner settings dead-letter UI |
| `apps/web/src/components/admin/system-mail-outbox-panel.tsx` | platform admin system-mail UI |
| `apps/api/src/modules/mail/mail.service.ts` | enqueue + deliver |
| `apps/api/src/common/pg-advisory-lock.util.ts` | MO lock keys |

## Ship bar (Lanes SS → TTTTT — locked)

| In scope (DONE) | Explicit non-goals / later |
|-----------------|----------------------------|
| Durable table + enqueue-on-send | Bull / SQS / separate worker service |
| Minute processor + advisory lock | Sub-minute latency SLA |
| Owner + SUPER_ADMIN dead-letter ops | Automatic Resend webhook reconciliation |
| jest coverage for outbox + lock | Load test of outbox table |
| Migration #8 in deploy checklist | DEAD-row archive policy (operator) |

---

## Operator checklist (Gates 0–5)

Run after Neon **`migrate deploy`** includes `20260721020000_mail_outbox` and API is **Resumed** (not Render-suspended).

| Gate | Action | Pass criteria |
|------|--------|---------------|
| **0** | Confirm migration #8 applied | `\d mail_outbox` exists; `/ready` 200 |
| **1** | Happy path | Trigger a real mail (e.g. owner password reset); row → `SENT`; Resend dashboard shows delivery |
| **2** | Worker claim | Insert or force a `PENDING` row with `nextAttemptAt <= now`; within 2 min → `SENT` or explicit `FAILED` with `lastError` |
| **3** | Retry path | Simulate Resend failure (bad key or vendor outage); row → `FAILED` then retries; after max attempts → `DEAD` |
| **4** | Owner UI | Settings → mail outbox: counts match DB; manual retry on `DEAD` → `PENDING` → eventual `SENT` |
| **5** | System mail | SUPER_ADMIN `/admin`: null-`shopId` dead letters visible + retry (password reset / platform mail) |

**Exit (§22 operator bar):** Gate 3 proven in **staging or prod** with intentional Resend degradation — not just unit tests.

---

## Residual phases (future lanes)

### Phase 1 — Prod retry proof (**OPERATOR** — Gate 3 above)

**Trigger:** First production deploy with migration #8.

**Exit:** Documented date + environment where DEAD/retry behavior was observed; link in [`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md).

### Phase 2 — Alerting + metrics (**RESIDUAL**)

**Trigger:** On-call maturity or repeated mail incidents.

| Work | Notes |
|------|--------|
| Outbox depth gauges | Count by `status`; age of oldest `PENDING` |
| DEAD growth alert | Slack/Pager when `DEAD` count rises |
| Processor lag | Time since last successful tick log |

Cross-ref: [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) Phase 4 — **stub shipped** (`gospots_mail_outbox_rows`, `gospots_mail_outbox_oldest_pending_age_seconds` via `MailOutboxService.statusCounts` + oldest PENDING query in `MetricsService`). Alert rules **residual**.

### Phase 3 — Retention policy (**DONE** opt-in — Lane **MAIL22-sent-retention**)

**Shipped:** daily SENT-row purge cron (disabled by default).

| Work | Notes |
|------|--------|
| Purge old `SENT` rows | `MailOutboxRetentionProcessor` `@Cron(EVERY_DAY_AT_4AM)` + `withMailOutboxRetentionCronLock` (GS/MR); deletes where `status=SENT` and `sentAt` older than N days (default **90**); batched **500**/loop |
| Env | `MAIL_OUTBOX_SENT_RETENTION_CRON=on` enables; `MAIL_OUTBOX_SENT_RETENTION_DAYS=90` (optional) |
| Archive `DEAD` | Align with [`RETENTION_POLICY.md`](../privacy/RETENTION_POLICY.md) ops review window — **residual** (manual owner/SUPER_ADMIN retry + ops review) |

**Non-goals:** Rewriting auth/reservation call sites; mandatory mail for MFA (§12 TOTP path).

---

## Operator next steps

1. Apply migration #8 on Neon → redeploy API → Resume Render if suspended.
2. Run Gates 0–5; record prod retry proof date when Gate 3 passes.
3. Wire Phase 2 alerts only after first real outage or DEAD accumulation.
4. Enable SENT retention when table size warrants: `MAIL_OUTBOX_SENT_RETENTION_CRON=on` (optional `MAIL_OUTBOX_SENT_RETENTION_DAYS=90`).
5. DR symptom table: [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) (Resend outage → owner dead-letter retry).
