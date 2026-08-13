# Chunk 13 — KDS / Production

Status: **ENGINEERING COMPLETE / PHYSICAL PILOT OPEN**

## Delivered
- Prep stations (kitchen/bar/dessert/other), route keys, tickets, ticket lines, status history and display-device registry.
- Immutable order snapshots carry `prepRouteKey`; KDS deterministically materializes station tickets and idempotently routes lines.
- Core state machine: NEW → PREPARING → READY → COLLECTED, with CANCELED from active states.
- Line-level cancellation propagates cancellation metadata back to the order line without repricing history.
- Ticket projection exposes age/preparation metrics and backend-generated READY/OVERDUE alert notifications based on station targets.
- Dedicated full-screen touch route shows alert counts and highlights ready/overdue tickets; primary progress is one large touch action.
- Authenticated SSE endpoint is available with resilient 2-second polling fallback for tenant-header browser constraints.
- Edge-safe KDS projection excludes money/payment/fiscal/KSeF data; tests protect the boundary and alert projection.

## Repository Gate 13
- [x] kitchen and bar routing.
- [x] line-level cancellation.
- [x] timing metrics and production alerts.
- [x] KDS usable touch-only.
- [x] Edge-enabled offline relay scenario represented/tested as a non-financial projection; local financial/compliance mutations remain prohibited.

## Phase 4 physical acceptance still required
- [ ] real touch display validation;
- [ ] kitchen + bar routing on supported physical displays/network;
- [ ] physical line-cancellation workflow;
- [ ] late-ticket timing observed on device;
- [ ] Edge local relay on the supported deployment where enabled;
- [ ] power/network interruption and recovery drill.

The engineering work is present on `main`. Chunk 13 must not be represented as physically certified until the Phase 4 pilot evidence above is captured.
