# GoSpots migration plan (current)

**As of:** 2026-07-22  
**Rule:** never `prisma migrate reset` on shared/prod. Prefer forward migrations + PITR.  
**Safety design:** [`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md)  
**Verify:** `pnpm --filter @gospots/api run verify:migrations`

---

## Applied on Neon (Friday wave — operator confirmed)

Folders through `20260721120000_seating_source_dining_table_group` (18 folders in that wave; disk total higher historically). Includes among others:

| Migration (representative) | Purpose |
|----------------------------|---------|
| `20260720210000_billing_webhook_events` | Lemon webhook receipt uniqueness |
| `20260720230000_money_decimal_core` | Money Decimal columns |
| `20260720240000_*` / `20260721090000_*` | MembershipPermission / SubscriptionAddOn + CSV DROP |
| `20260721010000_idempotency_receipts` | Client idempotency |
| `20260721020000_mail_outbox` | Durable mail |
| `20260721030000_dashboard_key_hash` | Hash-at-rest dashboard key |
| `20260721040000_currency_stamp_*` | Currency stamps |
| `20260721050000_tenant_rls_core` | RLS ENABLE+FORCE + policies |
| `20260721060000_reservation_resource_exclusion` | GiST exclusion (`tsrange`) |
| `20260721070000_gdpr_*` | Consent / DSAR |
| `20260721080000_user_mfa_totp` | Owner TOTP |
| `20260721100000_ledger_entry` | LedgerEntry + RLS |
| `20260721110000_guest_check` | GuestCheck + FKs |
| `20260721120000_seating_source_dining_table_group` | Dual-write FK |

**Deploy order:** backup/PITR → `prisma migrate deploy` → `verify:migrations` → app boot → smoke.

**Rollback:** forward-fix or Neon PITR — do not reset.

---

## App-level / flag cutovers (not SQL)

| Step | Command / flag | When |
|------|----------------|------|
| Legacy guest plaintext clear | `pnpm clear:guest-plaintext` | Before DROP plaintext |
| Pack add-on backfill | `pnpm backfill:legacy-addon-tier -- --apply` | Optional |
| Ledger backfill | `pnpm backfill:ledger -- --dry-run` then `--apply` | After `LEDGER_DUAL_WRITE` soak |
| Dual-write | `LEDGER_DUAL_WRITE=on` | After migrate + soak |
| Ledger reads | `LEDGER_READS=on` | After backfill parity |
| Tenant RLS | `TENANT_RLS=on` | After migrate + smoke — Gates 0–4 [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) |
| Legacy uploads off | `LEGACY_UPLOADS_STATIC=false` | When inventory=0 |

---

## Residual schema work (not yet / optional)

- DROP guest plaintext token columns (§11)  
- DROP dashboard key plaintext / grace (§13)  
- DROP `Subscription.tier` (§15)  
- Resource/dining Phase 4 DROP superseded seating (§17)  
- Split DB roles for RLS (§6)  

Each requires its own expand → dual-read → cutover → DROP sequence.

---

## Validation queries / scripts

- `pnpm --filter @gospots/api run verify:migrations`  
- `pnpm --filter @gospots/api run detect:reservation-overlaps` (before exclusion; already 0 at apply time)  
- `pnpm --filter @gospots/api run detect:resource-dining-drift`  
- Ledger: dry-run backfill counts; compare day totals to interim analytics during dual-read soak  

---

## Post-deploy checks

1. `/api/v1/live` 200 · `/api/v1/ready` database up  
2. Login + CSRF mutation  
3. Create booking + guest status link  
4. Complete order (stock)  
5. Lemon webhook duplicate no-op  
6. Optional: open GuestCheck → settle after children billed  
