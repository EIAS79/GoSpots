# GoSpots / Locora — Fix Plan (Phase 1 planning only)

**Priority order (mandatory):** data integrity → tenant security → finance → concurrency → auth → tests → architecture → ops → UX  

**Explicit:** Do **not** start with visual cleanup, branding polish, or dashboard layout refactors.

---

## 1. What to do first vs defer

### Do first (implementation Phase 2+)

1. **Money representation** (schema + util) — unblocks safe finance/FX work  
2. **Webhook idempotency table + handler guard** — cheap, high severity  
3. **Booking overlap atomicity** (transaction + lock or exclusion constraint)  
4. **Stock + sale single transaction** (fix `createTransaction` / order line paths)  
5. **Tenant mutation hardening** (`shopId` in every mutating `where`)  
6. **Finance reporting contract** (document sources; stop additive double-paths; ledger design spike)  
7. **Guest token hashing + expiry**  
8. **Baseline automated tests** for the above (see test matrix)

### Defer

- Service file splits (auth/finance) until characterization tests exist  
- Unified guest check / bill UX  
- Pack vs tier schema cleanup (keep dual until ledger/money stable)  
- Permissions/add-ons relational tables (after CSV validation layer)  
- Dining model unification (product decision needed)  
- 2FA, GDPR export, realtime websockets, observability stack  
- a11y/i18n sweeps, marketing copy vs product (“Realtime sync”)  
- Visual redesign / Locora branding cleanup

---

## 2. Ordered implementation phases

### Phase A — Data integrity foundations  
**Depends on:** nothing  
**Risk:** Medium–High (migrations + backfill)  
**Goals:**

- Introduce money type strategy (Decimal **or** integer minor units) — see migration plan  
- Add `BillingWebhookEvent` (or generic `WebhookReceipt`) unique on provider+eventId  
- Stamp `currency` on monetary rows (at least going forward)

**Exit criteria:** Migrations deployable on Neon without reset; old rows readable; new writes use new type.

---

### Phase B — Tenant security hardening  
**Depends on:** A optional (can parallelize with A if careful)  
**Risk:** Medium  
**Goals:**

- Audit all mutators: `update`/`delete` include `{ id, shopId }`  
- Media access policy decision (public catalog OK vs signed URLs for private)  
- Ensure `requireShopId` cannot be bypassed on finance/resources/reservations controllers

**Exit criteria:** Cross-tenant integration tests green.

---

### Phase C — Finance correctness  
**Depends on:** A (money type), B (shop scoping)  
**Risk:** High  
**Goals:**

- Define reporting rules: which sources are authoritative  
- Short-term: prevent double-path (e.g. completing ShopOrder must not also be entered as Transaction without link)  
- Medium-term: ledger table + post on complete/pay  
- Currency change: atomic reprice job + no partial updates

**Exit criteria:** Analytics totals match ledger fixtures; currency change all-or-nothing.

---

### Phase D — Concurrency  
**Depends on:** C partially (stock paths), bookings independent  
**Risk:** Medium–High  
**Goals:**

- Reservation create/update: interactive transaction + lock resource row; evaluate exclusion constraint  
- Stock adjust + order/tx write in one transaction  
- Idempotent play/reservation “mark paid”

**Exit criteria:** Parallel booking/stock Jest/k6 tests pass.

---

### Phase E — Auth & guest secrets  
**Depends on:** B  
**Risk:** Medium  
**Goals:**

- Hash guest tokens (reservation, event, chat); migrate existing plaintext  
- Token expiry + revoke on terminal states  
- Owner session list/revoke-all API  
- CSRF policy documented; enforce header or keep proxy+lax only  
- (Later) optional owner 2FA

**Exit criteria:** DB has no plaintext guest tokens; session revoke works.

---

### Phase F — Automated tests baseline  
**Depends on:** A–E features as they land  
**Risk:** Low  
**Goals:**

- Expand API unit/integration; add concurrency suites  
- Add Playwright smoke for login + public book + webhook signature  
- Wire CI (GitHub Actions): lint, test, migrate deploy dry-run

**Exit criteria:** CI required on PRs; critical paths covered.

---

### Phase G — Architecture cleanup  
**Depends on:** F characterization tests  
**Risk:** Medium  
**Goals:**

- Split `finance.service.ts` / `auth.service.ts`  
- Validate `offeringConfig` with typed schemas  
- Collapse dual entitlement reads to pack+addOns only  
- Permissions/add-ons tables

**Exit criteria:** Smaller modules; behavior unchanged (test parity).

---

### Phase H — Ops & reliability  
**Depends on:** F  
**Risk:** Medium  
**Goals:**

- Mail outbox + retries  
- Cron single-flight / external scheduler for multi-instance  
- Sentry/OTel; backup runbooks (Neon PITR)  
- GDPR export/delete sketch

**Exit criteria:** Failed Resend does not lose booking confirmation permanently; docs for restore.

---

### Phase I — Product/UX (last)  
**Depends on:** C, G product decisions  
**Risk:** Low–Medium for product, not security  
**Goals:**

- Unified guest check  
- Dining model unification  
- Realtime if still required  
- a11y/i18n gaps  
- Visual polish **only after** integrity/security

---

## 3. Suggested commit grouping

Use small, reviewable commits (do not squash unrelated domains):

1. `chore(audit): add phase-1 audit docs under docs/audit` *(this phase)*  
2. `feat(db): add money columns / decimal migration + money util`  
3. `feat(billing): webhook receipt idempotency`  
4. `fix(reservations): serialize booking create with resource lock`  
5. `fix(finance): atomic stock adjust with sale/order writes`  
6. `fix(tenant): include shopId on all resource mutations`  
7. `feat(finance): ledger posts + analytics read path` *(or interim reporting guards)*  
8. `feat(guest): hash and expire guest tokens`  
9. `feat(auth): owner session list/revoke`  
10. `test: concurrency + finance + webhook suites`  
11. `ci: add github actions lint/test`  
12. `refactor(finance|auth): split oversized services` *(after tests)*  
13. `feat(mail): outbox worker`  
14. UX/product commits only after above

---

## 4. Risk per phase

| Phase | Estimated risk | Notes |
|-------|----------------|-------|
| A Money / webhook schema | **High** | Backfill, Prisma client regen, report diffs |
| B Tenant hardening | **Medium** | Behavior-preserving if tests catch misses |
| C Finance ledger | **High** | Historical report discontinuities |
| D Concurrency | **Medium–High** | Needs Postgres features; load testing |
| E Auth/guest tokens | **Medium** | Breaks old guest links unless dual-read window |
| F Tests/CI | **Low** | Flaky e2e if env missing |
| G Refactors | **Medium** | Merge conflict magnet — keep mechanical |
| H Ops | **Medium** | Infra cost / Render limits |
| I UX | **Low** for security | High product scope |

---

## 5. Dependencies diagram (text)

```
A (money + webhook schema)
 ├── C (finance / ledger)
 │    └── D (stock atomicity) ──┐
 ├── D (booking locks) ─────────┼── F (tests/CI) ── G (splits) ── H (ops) ── I (UX)
 B (tenant) ────────────────────┘
 E (guest tokens / sessions) ─── depends on B; feeds F
```

---

## 6. Implementation phase recommendation (next)

**Start Phase A + webhook idempotency + booking lock spike in parallel only where migrations don’t conflict; first merge should be webhook receipts (low coupling) then money type design decision documented in migration plan.**

Do not open PRs for UI cleanup until Phase F gates exist.
