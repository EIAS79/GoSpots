# Migration pre-flight (Neon deploy)

**Date:** 2026-07-21 (refreshed; #1–#8 detail from 2026-07-20)  
**Rule:** `prisma migrate deploy` only — **never** `migrate reset` / `db push` against Neon.  
**Checklist:** see [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md).

## Schema ↔ pending SQL alignment

**Drift: no.** Compared `schema.prisma` to pending migration SQL through GuestCheck / seating source FK / LedgerEntry / MFA / GDPR / RLS / currency stamps / dashboard key hash (exclusion is SQL-only). No orphan schema fields and no missing models relative to those migrations. No schema/SQL edits required.

| Check | Result |
|-------|--------|
| Folders on disk (timestamp order) | **18** under `apps/api/prisma/migrations/` (`20260720210000_*` … `20260721120000_seating_source_dining_table_group`) |
| `prisma validate` | **Pass** — `schema.prisma` valid |
| Schema vs pending SQL | **Aligned** (no drift) |
| `apps/api/.env` `DATABASE_URL` | **Neon active** (local Postgres URL commented out) |
| Live `migrate deploy` this session | **Not run** |
| Read-only `prisma migrate status` | Confirm all **18** pending on deploy host |

Do **not** point `migrate deploy` at Neon from a workstation `.env` until the deploy window in `DEPLOY_CHECKLIST.md`.

---

## Summary

| # | Migration | Verdict |
|---|-----------|---------|
| 1 | `20260720210000_billing_webhook_events` | **PASS** |
| 2 | `20260720220000_shop_timezone` | **PASS** |
| 3 | `20260720230000_money_decimal_core` | **WARN** |
| 4 | `20260720240000_membership_permissions_subscription_addons` | **PASS** |
| 5 | `20260720250000_guest_token_hash_expiry` | **WARN** |
| 6 | `20260720260000_auth_session_family` | **PASS** |
| 7 | `20260721010000_idempotency_receipts` | **PASS** |
| 8 | `20260721020000_mail_outbox` | **PASS** |
| 9 | `20260721030000_dashboard_key_hash` | **PASS** |
| 10 | `20260721040000_currency_stamp_monetary_rows` | **PASS** |
| 11 | `20260721050000_tenant_rls_core` | **PASS** |
| 12 | `20260721060000_reservation_resource_exclusion` | **WARN** |
| 13 | `20260721070000_gdpr_consent_dsar` | **PASS** |
| 14 | `20260721080000_user_mfa_totp` | **PASS** |
| 15 | `20260721090000_drop_membership_permissions_subscription_addons_csv` | **WARN** |
| 16 | `20260721100000_ledger_entry` | **PASS** |
| 17 | `20260721110000_guest_check` | **PASS** |
| 18 | `20260721120000_seating_source_dining_table_group` | **PASS** |

**Overall:** **14 PASS / 4 WARN**. Apply in order via `migrate deploy` after acknowledging WARN gates (money locks; guest `pgcrypto`; exclusion overlaps=0; CSV DROP after app cutover).

---

## 1. `20260720210000_billing_webhook_events` — PASS

**SQL:** `CREATE TABLE "BillingWebhookEvent"` + unique `(provider, eventId)` + index `(shopId, processedAt)`.

| Criterion | Notes |
|-----------|--------|
| Matches `schema.prisma` | Yes — model `BillingWebhookEvent` |
| Safe expand | Yes — new empty table |
| DROP / data loss | None |

---

## 2. `20260720220000_shop_timezone` — PASS

**SQL:** `ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC'`.

---

## 3. `20260720230000_money_decimal_core` — WARN

**SQL:** In-place `ALTER COLUMN … TYPE DECIMAL(19,4)` on commercial money columns.

**Warn:** AccessExclusiveLock per column; not expand-only (rollback = reverse migrate / PITR). Spot-check null counts after deploy.

---

## 4. `20260720240000_membership_permissions_subscription_addons` — PASS

New `MembershipPermission` + `SubscriptionAddOn` + CSV backfill; CSV columns retained until #15.

---

## 5. `20260720250000_guest_token_hash_expiry` — WARN

Needs **`pgcrypto`**; unique index builds + bulk `UPDATE`. Plaintext kept for dual-read.

---

## 6. `20260720260000_auth_session_family` — PASS

`familyId` + unique `refreshTokenHash`. Code wired (reuse → family revoke).

---

## 7. `20260721010000_idempotency_receipts` — PASS

Expand-only `IdempotencyReceipt`. Code wired.

---

## 8. `20260721020000_mail_outbox` — PASS

Expand-only `MailOutbox`. Code wired.

---

## 9. `20260721030000_dashboard_key_hash` — PASS

Expand + backfill `Shop.dashboardKeyHash` (`pgcrypto`); plaintext retained. Code wired.

---

## 10. `20260721040000_currency_stamp_monetary_rows` — PASS

Expand + backfill per-row currency stamps. Dual-write/read wired.

---

## 11. `20260721050000_tenant_rls_core` — PASS

ENABLE+FORCE RLS on Tier A tables. App `SET LOCAL`; opt-in `TENANT_RLS` (default off).

---

## 12. `20260721060000_reservation_resource_exclusion` — WARN

GiST `EXCLUDE` on active reservation ranges. **Gate:** `pnpm detect:reservation-overlaps` = 0 or `ALTER` fails. PlaySession walk-in still app-lock.

---

## 13. `20260721070000_gdpr_consent_dsar` — PASS

Consent / DSAR tables — expand-only. Code wired (#25).

---

## 14. `20260721080000_user_mfa_totp` — PASS

User TOTP columns + `MfaRecoveryCode` — expand-only. Owner MFA wired (#18).

---

## 15. `20260721090000_drop_membership_permissions_subscription_addons_csv` — WARN

**Contract DROP** of `Membership.permissions` / `Subscription.addOns`. **Gate:** live app must never SELECT those columns. `pendingAddOns` stays. Rollback = PITR.

---

## 16. `20260721100000_ledger_entry` — PASS

`LedgerEntry` (+ RLS policy). Dual-write behind `LEDGER_DUAL_WRITE` (default off).

---

## 17. `20260721110000_guest_check` — PASS

**SQL:** `GuestCheck` table + `GuestCheckStatus` enum; nullable `guestCheckId` FKs on `Reservation` / `PlaySession` / `ShopOrder`; conditional `LedgerEntry.guestCheckId` FK + index; opt-in RLS when `app_tenant_rls_ok` exists.

| Criterion | Notes |
|-----------|--------|
| Matches `schema.prisma` | Yes — model `GuestCheck` + child FKs |
| Safe expand | Yes — new table + nullable columns / SET NULL FKs |
| DROP / data loss | None |

Bible **#10 DONE** Phase 0–2 (ops container). Neon apply is operator Friday (same pass as folders 1–18).

---

## 18. `20260721120000_seating_source_dining_table_group` — PASS

**SQL:** nullable unique `SeatingTableGroup.sourceDiningTableGroupId` → `DiningTableGroup` (`ON DELETE CASCADE`) + shop composite index.

| Criterion | Notes |
|-----------|--------|
| Matches `schema.prisma` | Yes — `SeatingTableGroup.sourceDiningTableGroupId` |
| Safe expand | Yes — nullable FK + indexes only |
| DROP / data loss | None |

Bible **#14 DONE** Phase 0–2 (Option C expand dual-write). Neon apply is operator Friday (same pass as folders 1–17).

---

## Recommended apply command (when ready)

```bash
pnpm --filter @gospots/api migrate:deploy
```

**Order is timestamp order** (1 → 18). Do not reorder folders.

## Skipped this preflight

- `prisma migrate diff` against a shadow DB.
- Local rehearsal deploy (local Postgres URL not active in `.env`).
- Any write to Neon beyond read-only `migrate status`.
