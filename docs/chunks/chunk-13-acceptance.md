# Chunk 13 — KDS / Production

Status: IMPLEMENTED_ON_FEATURE_BRANCH

## Delivered
- Prep stations (kitchen/bar/dessert/other), route keys, tickets, ticket lines, status history and display-device registry.
- Order snapshots carry `prepRouteKey`; KDS deterministically materializes station tickets from open/sent orders and idempotently upserts lines.
- Core state machine: NEW → PREPARING → READY → COLLECTED, with CANCELED from active states.
- Line-level cancellation propagates back to the immutable order line as cancellation metadata, never a price rewrite.
- Ticket status is projected from line states and includes age/preparation timing metrics.
- Dedicated full-screen touch route `/kds/[venuePath]` avoids dashboard chrome; primary ticket progress is one large touch action.
- Authenticated SSE endpoint `/kitchen/stream` is available; KDS also uses resilient 2-second polling because browser EventSource cannot attach the tenant header.
- Edge-safe KDS projection intentionally excludes money/payment/fiscal/KSeF data; unit test protects this boundary.

## Gate 13
- [x] Kitchen and bar routing via station kind + `prepRouteKey`.
- [x] Line-level cancellation.
- [x] Timing metrics.
- [x] KDS usable touch-only.
- [x] Edge-enabled offline relay scenario represented/tested as a non-financial projection; local financial/compliance mutations remain prohibited.

Full branch CI is required before final completion sign-off.
