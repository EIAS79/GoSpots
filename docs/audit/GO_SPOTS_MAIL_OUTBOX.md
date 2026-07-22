# Locora — Mail outbox design (Lane E → Lane SS → Lane TTTTT)

**Date:** 2026-07-20 (stub) / 2026-07-21 (durable slice + system-mail ops)  
**Status:** Durable outbox + owner dead-letter UI + SUPER_ADMIN system-mail ops shipped. **Bible #22 DONE** (code). Live prod retry proof remains **OPERATOR**.

## Problem

`MailService.send` calls Resend synchronously. Transient HTTP failures, cold starts, and unconfigured prod keys lose the send with no durable retry. Call sites (auth, reservations) mostly try/catch and continue — guests never get a follow-up email.

## Architecture (Lane SS)

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

## Worker

- Nest `@Cron(EVERY_MINUTE)` on `MailOutboxProcessor.tick`
- Single-flight via `withMailOutboxCronLock` (`pg-advisory-lock.util`, keys GS/MO)
- Batch: `MAIL_OUTBOX_BATCH_SIZE` (20)

## Files

| Path | Role |
|------|------|
| `apps/api/prisma/migrations/20260721020000_mail_outbox/` | Expand-only table |
| `apps/api/src/modules/mail/mail-outbox.service.ts` | enqueue / mark* / dead-letter list+requeue (+ `systemOnly`) |
| `apps/api/src/modules/mail/mail-outbox.processor.ts` | cron worker |
| `apps/api/src/modules/mail/mail-outbox.controller.ts` | owner + SUPER_ADMIN dead-letter list + retry |
| `apps/web/src/lib/mail-outbox-client.ts` | venue + system dead-letter clients |
| `apps/web/src/components/settings/mail-outbox-panel.tsx` | owner settings dead-letter UI |
| `apps/web/src/components/admin/system-mail-outbox-panel.tsx` | platform admin system-mail UI |
| `apps/api/src/modules/mail/mail.service.ts` | enqueue + deliver |
| `apps/api/src/common/pg-advisory-lock.util.ts` | MO lock keys |

## Dead-letter API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| `GET` | `/mail/outbox/dead` | OWNER | Venue counts + DEAD list; `?includeFailed=1`; no html/text |
| `POST` | `/mail/outbox/:id/retry` | OWNER | Shop-scoped DEAD → PENDING |
| `GET` | `/mail/outbox/system/dead` | SUPER_ADMIN | `shopId IS NULL` only |
| `POST` | `/mail/outbox/system/:id/retry` | SUPER_ADMIN | System DEAD → PENDING |

## Operator residual (not a code blocker)

- Prove retries under a real Resend outage after Neon migrate of `mail_outbox`.
- Optional: alerting / metrics on DEAD growth.
