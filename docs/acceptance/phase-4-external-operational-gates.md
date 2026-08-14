# Phase 4 — External / Operational Gates

Status: **BLOCKED_ON_EXTERNAL_OR_PHYSICAL_EVIDENCE**

Baseline `main` at phase start: `f61c1b2f81eedb0ff7d5e67be4a62291c361c2bc` (merged Phase 3).

This record separates repository-executable proof from evidence that requires a real provider environment, physical venue hardware, or professional Polish accounting/tax/legal review. Mocks and unit tests do not substitute for those external acceptance steps.

## Open external / physical gates

### Chunk 07 — payment terminal pilot

**Status:** external provider/reader action required.

Close only after the supported test-reader flow proves success, decline/cancel, ambiguous-result reconciliation, duplicate safety, refund behavior, reader-offline behavior, reassignment, audit/correlation evidence, and rollout/kill-switch behavior.

### Chunk 08 — Poland fiscalization + KSeF

**Status:** external provider/professional review action required.

Close only after KSeF TEST/DEMO submission and reconciliation evidence, FA(3)/UPO evidence where applicable, certified fiscal-provider/device validation, duplicate/timeout handling, correction/refund lineage, and written review of the marketed Polish accounting/tax/legal scope.

### Chunk 13 — KDS physical pilot

**Status:** physical pilot required.

Close only after real kitchen/bar display routing, line cancellation, timing/late-ticket behavior, local Edge relay where enabled, and power/network interruption recovery are exercised on venue hardware.

### Chunk 14 — inventory operational pilot

**Status:** operational venue pilot required.

Close only after a representative venue drill covers purchase order, goods receipt, recipe consumption, waste/loss, stocktake, weighted-average cost/COGS, permissions/audit, negative-stock policy, and report reconciliation.

### Chunk 16 — reservation deposit provider roundtrip

**Status:** external provider/deployment configuration required.

Close only after a deployed test roundtrip proves deposit creation, authoritative callback/webhook processing, booking confirmation, cancellation/refund, duplicate callback safety, and timeout/reconciliation.

### Chunk 20 — Analytics production-size proof

**Status:** repository regression added; exact-head CI and production-like latency evidence remain acceptance work.

The Phase 4 branch contains `growth-analytics.performance.spec.ts` as a deterministic scale/reconciliation guard. It must pass exact-head CI. A production-like database benchmark should also be captured where deployed query latency or data distribution materially differs from the synthetic application-layer test.

### Chunk 22 — provider-neutral integration platform

**Status:** repository-side architecture complete; no external POS gate.

GoSpots is the standalone source of truth for checkout, invoicing, payments, guest checks, resource/session timing, reservations, inventory, restaurant operations, billiards operations, reporting, and venue workflows.

The retained integration subsystem is optional provider-neutral infrastructure. The standalone baseline registers no third-party POS adapter and must work with every optional connector disabled. Future provider-specific adapters are separate product decisions and require official documentation, explicit ownership boundaries, simulator coverage, tenant/idempotency/reconciliation testing, and their own live acceptance gate before enablement.

This boundary is intentional for future offline/Edge operation: core GoSpots workflows must not depend on continuous connectivity to another POS product.

### Chunk 23 — physical hardware certification

**Status:** physical hardware certification required.

Close only after the supported hardware matrix verifies receipt and kitchen/bar printing, network interruption/retry, duplicate-safe fiscal semantics, scanner input, customer-display behavior, cash-drawer support where applicable, device diagnostics, and Edge restart/claim recovery.

## Phase 4 acceptance decision

Phase 4 is not complete while the remaining external/physical gates above are open or exact-head CI is not green. Chunk 22 is no longer an external-provider blocker.

Do not begin Phase 5 while Phase 4 is represented as complete.
