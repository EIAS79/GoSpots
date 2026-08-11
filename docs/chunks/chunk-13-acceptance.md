# Chunk 13 — KDS / Production

Status: COMPLETE_ON_UNMERGED_REVIEW_BRANCH

## Delivered
- Prep stations (kitchen/bar/dessert/other), route keys, tickets, ticket lines, status history and display-device registry.
- Immutable order snapshots carry `prepRouteKey`; KDS deterministically materializes station tickets and idempotently routes lines.
- Core state machine: NEW → PREPARING → READY → COLLECTED, with CANCELED from active states.
- Line-level cancellation propagates cancellation metadata back to the order line without repricing history.
- Ticket projection exposes age/preparation metrics and backend-generated READY/OVERDUE alert notifications based on station targets.
- Dedicated full-screen touch route shows alert counts and highlights ready/overdue tickets; primary progress is one large touch action.
- Authenticated SSE endpoint is available with resilient 2-second polling fallback for tenant-header browser constraints.
- Edge-safe KDS projection excludes money/payment/fiscal/KSeF data; tests protect the boundary and alert projection.

## Gate 13
- [x] kitchen and bar routing.
- [x] line-level cancellation.
- [x] timing metrics and production alerts.
- [x] KDS usable touch-only.
- [x] Edge-enabled offline relay scenario represented/tested as a non-financial projection; local financial/compliance mutations remain prohibited.

This PR is intentionally unmerged. Exact-head CI must remain green before merge is ever requested.
