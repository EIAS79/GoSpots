# Phase 12 — Edge Operator Authority

This document supplements `phase-12-offline-edge-hardware-continuity.md` for the local authorization boundary.

## Rule

Offline capability never means offline authorization bypass.

The cloud API exposes a signed, venue-bound Edge operator snapshot containing only active memberships for the registered Edge Hub venue. Each entry contains the user identity, role, active state and effective permission set derived from canonical `MembershipPermission` rows.

The Edge Hub caches that snapshot with the rest of the venue-local subset and fails closed for certified writes:

| Operation | Last-known permission required |
| --- | --- |
| Session start/pause/resume/end | `session.write` |
| Order create | `order.write` |
| GuestCheck create/update | `checkout.write` |
| Cash payment | `checkout.write` |

`OWNER` retains the existing owner-role permission semantics. Missing, inactive or insufficiently privileged operators are rejected locally before a command or financial fact is persisted.

## Revalidation on reconnect

The Edge check is a continuity guard, not a replacement for cloud authority. On replay, the cloud resolves the human operator again from the current active venue membership and rechecks the relevant permission before canonical mutation. A permission removed during an outage therefore causes replay to fail/conflict rather than silently applying stale privilege.

Tenant scope is derived from the signed registered Edge device. A client-provided venue identifier is consistency metadata only and is rejected when it differs.

## Cash integrity

Offline cash is accepted locally only when:

- the cached operator has `checkout.write` (or existing owner semantics apply);
- `amountMinor` is a positive safe integer;
- currency matches the cached venue currency;
- each allocation is positive and exactly representable in that currency's minor-unit scale;
- the exact integer sum of allocations equals `amountMinor`.

No floating-point arithmetic is used for this local authoritative check. Cloud replay independently validates the same commercial allocation using the canonical checkout/payment services and current operator authority.

## Evidence

- Edge tests reject an insufficiently privileged cached operator and assert no command is queued.
- API tests reject an operator without `checkout.write` before an idempotency receipt or Payment is created.
- The full-outage drill uses cached cashier permissions across an Edge SQLite restart and still proves one-and-only-one pending cash fact.
