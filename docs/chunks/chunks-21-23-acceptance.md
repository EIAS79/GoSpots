# Chunks 21–23 Historical Acceptance — Enterprise Ecosystem

This document preserves implementation evidence from the earlier chunk program. The current product contract is the Master Product & Engineering Execution Plan v2 and its Phase 0 standalone rule.

## Shared integrity rules preserved

- Tenant-owned integration and hardware data remains Shop-scoped and protected by the existing tenant/RLS mechanisms.
- Organization-wide reads require verified organization membership and explicit venue scope.
- `organizations_v1` and `integrations_v1` remain server-authoritative rollout controls.
- API credentials remain hash-only; connector/webhook secrets remain encrypted at rest.
- Durable work retains idempotency/dedupe keys, correlation IDs, bounded retries and dead-letter semantics.
- Exact-head CI remains required for changes to these domains.

## Chunk 21 — Organization / multi-location

Existing repository work includes Organization, OrganizationMembership and OrganizationShop models; role/scope enforcement; organization-level venue linking; cross-location ledger analytics; operator UI; and tenant/security tests. This work remains useful input to the new Phase 13 acceptance audit.

## Chunk 22 — Provider-neutral integration platform

### Product boundary

GoSpots is a standalone venue operating system. Core checkout, invoicing, payments, guest checks, timed sessions, restaurant operations, billiards operations, reservations, inventory, reporting and venue continuity must not require another POS product.

The integrations subsystem is an optional extension boundary for independently justified external capabilities. A connector may exchange data or invoke a provider, but it may not become the source of truth for GoSpots core domains or a mandatory dependency for venue operation.

### Existing provider-neutral platform

- connector installation model and registry;
- encrypted connector secrets and health/error state;
- durable integration jobs with tenant binding, idempotency keys, retries, dead-letter state, correlation IDs and atomic claims;
- stale-processing lease recovery;
- integration mappings and external-reference foundation;
- hash-only scoped API credentials;
- versioned integration API;
- signed inbound webhooks with replay protection and payload-hash conflict detection;
- signed outbound webhooks with stable event IDs, retry/backoff and delivery history;
- webhook target validation;
- deterministic demo connector for platform testing;
- operator UI for installation, credentials, webhook and queue administration.

The standalone baseline registers only connectors intentionally included in the product. No external POS integration is a release prerequisite.

### Future provider rule

A future provider-specific adapter may be added only for an explicit product/customer requirement. It must use official supported contracts, remain fail-closed until configured, preserve tenant isolation and idempotency, and pass its own outage/retry/reconciliation acceptance. It remains optional to GoSpots core operation.

## Chunk 23 — Hardware / printing / customer display / barcode

Existing repository work includes durable print jobs, printer routes, signed Edge claims, retry/lease recovery, TCP ESC/POS transport, customer display binding, barcode aliases, operator hardware UI, and API/Edge tests.

Physical model certification remains separate operational evidence; deterministic adapters do not prove every printer, scanner, cash drawer, display or vendor-specific driver.

## Supersession note

Earlier wording that made a specific external POS connector or its licensed API a completion gate is superseded by the Master Product & Engineering Execution Plan v2. Future acceptance should be recorded against Phases 0–17 rather than treating this historical chunk document as the current program source of truth.
