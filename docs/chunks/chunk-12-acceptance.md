# Chunk 12 — Menu, Ordering and Pricing Foundation 2.0

Status: IMPLEMENTED_ON_FEATURE_BRANCH

## Delivered
- Modifier groups/modifiers, item↔group links and item variants.
- Per-item commerce profile provides tax-category, prep-routing and recipe hooks for later chunks.
- Dedicated server pricing boundary accepts item/variant/modifier IDs and context; it never accepts client money values.
- Immutable order-line snapshots preserve item/variant/modifier names, component prices, tax and routing/recipe hooks.
- Quick sale, GuestCheck, dining, play-session, takeaway, preorder and event service modes share one order model.
- A play-session order inherits the active OperationsSession guestCheck/resource when not explicitly supplied.
- Order-entry UI provides category/search flow and only opens the variant/modifier sheet for configurable items.

## Gate 12
- [x] Variants/modifiers.
- [x] Order can use the same GuestCheck as a resource/play session.
- [x] Price/tax calculation is server-owned integer-minor-unit math.
- [x] Historical order snapshots are immutable; cancel is a status/timestamp, not a rewrite.
- [x] Menu remains a separate route, so gaming venues with menu disabled are not forced into hospitality UI.

Full branch CI is required before final completion sign-off.
