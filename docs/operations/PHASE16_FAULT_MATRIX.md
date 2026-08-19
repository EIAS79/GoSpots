# Phase 16 fault and load validation matrix

Source: GoSpots Master Product & Engineering Execution Plan v2 — Steps 16.7 and 16.8.

Phase 16 does not treat a successful build as resilience proof. The blocking CI and permanent regression suites cover the following failure classes and mixed workload surfaces.

## Fault injection

| Required fault | Permanent proof | Expected invariant |
|---|---|---|
| Database latency/unavailability | `.github/workflows/phase16-validation.yml` starts compiled API, pauses PostgreSQL 17, checks `/live` stays up, `/ready` fails, then verifies readiness recovers | dependency outage is visible; writes are not falsely reported healthy |
| Payment/provider timeout/uncertainty | existing `device-payment` domain tests plus full API CI; `PaymentOperation=UNKNOWN` is exposed by Phase 16 metrics | never convert uncertainty to decline or permit blind duplicate retry |
| Webhook duplication/replay | growth reservation Stripe webhook routing/idempotency tests and normal API suite | same provider event/request cannot double-apply a deposit/payment fact |
| Printer unavailable/retry | `apps/edge/test/printing.test.js` plus normal Edge suite | durable PrintJob/retry is visible; business transaction is not duplicated |
| Edge reconnect/replay storm | `phase12-continuity.test.js`, `phase12-full-outage-drill.test.js`, and blocking Edge hard-outage workflow | deterministic replay/idempotency; no duplicate money |
| Worker restart | durable mail outbox/domain-event/automation tests in full API CI; backlog survives process memory | retries resume from durable state, not process-local assumptions |
| KSeF unavailable/special mode | compliance/KSeF unit and Phase 5 regression coverage; Phase 16 backlog gauges | outage remains explicit and deadline/reconciliation state is preserved |
| Email/SMS/provider unavailable | durable mail outbox failure/backoff/dead-letter behavior in mail/automation tests; Phase 16 outbox age metric | queued action remains durable and retryable without duplicate send |

## Mixed workload / load proof

Permanent browser test: `apps/web/e2e/integrity/phase16-hardening.spec.ts`.

The mixed-venue scenario performs real authenticated operations against seeded PostgreSQL and then issues concurrent waves covering:

- live floor reads;
- cashier/open-check reads after a real UI check creation;
- concurrent reservation writes and reservation reads;
- KDS board reads after station creation;
- owner Phase 14 analytics workspace reads.

It records request durations and enforces a 5 s P95 CI regression budget. This budget is intentionally looser than production SLOs because GitHub-hosted runners are noisy; production SLOs remain the measured objectives in `OBSERVABILITY_AND_SLOS.md`.

Additional concurrent/failure traffic remains covered by the domain suites that run on the same exact commit:

- webhook duplicate/replay tests;
- Edge replay/outage tests;
- payment idempotency/reconciliation tests;
- PostgreSQL migration/integrity tests;
- full browser E2E.

## Accessibility/device proof

The Phase 16 browser test also verifies the mixed operator shell at 390×844 and 1440×900:

- no unexpected horizontal overflow at the narrow viewport;
- keyboard Tab reaches a visible focus target;
- the focused control has visible focus styling and an accessible label/text;
- visible primary controls are at least 32×32 CSS px in the tested shell.

The marketed support boundary is `docs/operations/SUPPORTED_CLIENTS.md`; browser success never implies untested hardware compatibility.

## Acceptance interpretation

A fault is accepted only if the expected invariant remains true. A test that merely injects an error without checking durable state/recovery does not satisfy Phase 16.
