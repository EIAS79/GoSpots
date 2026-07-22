# Locora — GDPR data map, retention & consent

**Date:** 2026-07-21  
**Status:** **DONE** (code) — Neon migrate + Lemon/Resend processor purge = OPERATOR.  
**Bible:** P2 **#25** — DONE.  
**Ship:** Export, guest erase (+ by email), account wipe, consent records, guest DSAR, retention cron. Money amounts **never** auto-deleted (accounting carve-out).

---

## Recommendation (operator)

| When | Action |
|------|--------|
| **Now** | Deploy migration `20260721070000_gdpr_consent_dsar` with other pending migrates (never reset). |
| **Ongoing** | Retention cron on by default (`GDPR_RETENTION_CRON=off` to disable). |
| **Processor gate** | Cancel Lemon subscription + document Resend/Lemon DPA purge manually — no in-app processor delete API. |

---

## Shipped surfaces

| Piece | Detail |
|-------|--------|
| Export | `GET /gdpr/export` — shop, memberships, guests, consent, DSAR, audit, session metadata, finance counts |
| Guest erase | `POST /gdpr/erase-guest` (5 entity types) + `POST /gdpr/erase-guest-email` |
| Account wipe | `POST /gdpr/erase-account` — password + `DELETE MY ACCOUNT` |
| Consent | `ConsentRecord` + required checkbox on public creates |
| Guest DSAR | `POST /public/venues/:slug/gdpr/dsar` + venue Book tab; owner `GET/POST /gdpr/dsar*` |
| Retention | Daily cron — aged PII redact, audit strip, analytics delete, session purge |
| Web | Settings Privacy (export/erase/by-email/DSAR/account wipe); public consent checkboxes |

---

## Accounting invariant (non-negotiable)

Money rows (`Transaction`, `ShopOrder`, `billedAmount`, `PlaySession` billing) survive guest PII purge and account wipe. Aligns with tax retention.

---

## Related

- [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) — #25 DONE  
- [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) — Lane VVVVVV  

*Lane VVVVVV — bible #25 GDPR DONE.*
