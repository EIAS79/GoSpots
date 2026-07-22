# GoSpots fix plan (remaining work)

**As of:** 2026-07-22  
**Canonical status:** [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md)  
**Rule:** verify → characterize → move/fix → test → document. No `prisma migrate reset`.

Priority order follows the original prompt (§2.2 / §39), filtered to **what is still open**.

---

## P0 — Operator unblock (before more feature waves)

1. **Resume Render** `gospots-api` (suspended-by-user) → `/live` + `/ready` green  
2. Smoke: CORS, login+CSRF, book, guest link, stock+sale, Lemon dup no-op  
3. Keep `TENANT_RLS` / `LEDGER_DUAL_WRITE` / `LEDGER_READS` **off** until soak  

---

## P0 — Data / finance / tenancy residuals

| Order | Item | Action |
|------:|------|--------|
| 1 | §5 Ledger | Operator Gates 0–7 [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md): dual-write soak → `backfill:ledger --apply` → optional `LEDGER_READS=on` → later Phase 5 freeze |
| 2 | §6 RLS | Soak `TENANT_RLS=on` — Gates 0–4 [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md); plan DB role split later |
| 3 | §7/§8 Concurrency | Operator Gates 0–3 [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) — opt-in live C1–C3 against **local Docker only** (harness refuses Neon) |
| 4 | §19 Ticket | Decide: defer Option B/C **or** design settle-root + finance-contract revision (XL — do not rush) |

---

## P1 — Architecture / security residuals

| Order | Item | Action |
|------:|------|--------|
| 5 | §14 Service split | Next: characterize + extract play-billing, then play-sessions; then auth refresh/login slices; then reservations |
| 6 | §12 MFA | Staff MFA / WebAuthn / require-MFA — [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md) Phases 1–5 |
| 7 | §17 Resource merge | Phase 3 UI cutover → Phase 4 DROP after soak |
| 8 | §11/§13/§15/§16 | Optional DROP plaintext/legacy columns after soak |

---

## P2 — Ops / privacy / quality

| Order | Item | Action |
|------:|------|--------|
| 9 | §27 Privacy | Keep DATA_MAP/RETENTION_POLICY current; counsel-aligned public policy; retention job soak |
| 10 | §36 API consistency | ~~Introduce error envelope~~ **DONE**; OpenAPI + domain codes residual — [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md) |
| 11 | §24 Observability | OTel + web Sentry |
| 12 | §23 Realtime | Redis/multi-instance SSE when scale requires |
| 13 | §26 Uploads | Signed/private GET phases |
| 14 | §29/§34 Tests | Dashboard axe + harder CI gates + e2e matrix |
| 15 | §35 Perf | Index audit + one load script (k6 or artillery) |
| 16 | §30 i18n | Secondary locales when needed |

---

## Explicitly defer (do not start as “bible leftover bugs”)

- Mass brand rewrite  
- Full offline-first POS  
- Fiscal/legal POS certification claims  
- Rewriting Nest/Next frameworks  
- Deleting the test suite to “make commits smaller”  

---

## Done recently (do not re-open)

Money Decimal+wire · exclusion + stock atomics · Lemon idempotency · CSRF · guest hash · sessions+owner TOTP · pack entitlements · CSV rows · GuestCheck+settle-gate · ledger dual-write/backfill/reads flags · mail outbox · health · DR doc · GDPR module · finance extracts (reports/losses/tx/orders) · auth sessions extract  

Details: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)
