# Billing operations

## Reconciliation

Hourly `BillingJobsProcessor` (when `BILLING_ENABLED=true` and `BILLING_CRON` not off), under `withBillingCronLock`:

1. Renewal reminders (5 / 3 / 1 days before `currentPeriodEnd`)
2. Payment-method expiry reminders (default cards expiring this/next month)
3. Scheduled resume (`PAUSED` + `resumeAt <= now`)
4. Grace expiry: `PAST_DUE` → `UNPAID`; period-end cancels; manual expiry
5. Stale checkout cleanup (24h)
6. Drain due webhook inbox rows (`processDueEvents`)
7. Provider reconciliation (`BillingReconciliationService.reconcileBatch`) — audit mismatches only

## Dead-letter handling

1. `GET /api/v1/billing/webhooks/dead-letter` (owner sees own shop; SUPER_ADMIN sees all)
2. Read `lastError`, `eventName`, `provider`
3. Fix root cause (secrets, missing metadata `shop_id`, adapter bug)
4. `POST /api/v1/billing/webhooks/dead-letter/:id/replay` — or reset row to `FAILED` with `nextAttemptAt = now()`
5. Confirm `PROCESSED` and entitlement sync

Never re-insert the same `(provider, eventId)` — use claim/retry on the existing row.

## Rollout checklist

1. Apply Prisma migration for dual-provider billing models
2. Set secrets in env (Stripe and/or Mollie); leave `BILLING_ENABLED=false` until dry-run done
3. Configure webhook endpoints in provider dashboards (test mode first)
4. Set `BILLING_STRIPE_ENABLED` / `BILLING_MOLLIE_ENABLED` and `BILLING_DEFAULT_PROVIDER`
5. Keep `BILLING_LEMON_ENABLED=false` (default); do not open new Lemon checkouts
6. Flip `BILLING_ENABLED=true` for a canary shop / staging
7. Run one automatic + one manual checkout per enabled provider
8. Verify inbox → PROCESSED, entitlement ACTIVE, notifications
9. Enable `BILLING_CRON` (default on when dual billing enabled)
10. Monitor DEAD webhooks and PAST_DUE grace behavior for 1–2 billing cycles
11. Cut over production; leave Lemon keys for historical portal/read if needed

## Rollback

Fast disable (preferred):

```
BILLING_ENABLED=false
```

Effects:

- Orchestrator dual checkout/mutations stop (`Dual-provider billing is not enabled`)
- Billing cron no-ops
- Existing `Billing*` rows remain (audit); entitlement `Subscription` rows stay as last synced

Lemon emergency / legacy:

```
BILLING_LEMON_ENABLED=true
# or only checkout escape hatch:
BILLING_LEMON_LEGACY_CHECKOUT=true
```

Keep Lemon documented as legacy. Prefer fixing dual-provider issues over long-term Lemon re-enable.

Provider-specific rollback: set `BILLING_STRIPE_ENABLED=false` or `BILLING_MOLLIE_ENABLED=false` without clearing the other; adjust `BILLING_DEFAULT_PROVIDER`.

Do **not** run destructive DB drops to roll back. Preserve webhook and payment history.
